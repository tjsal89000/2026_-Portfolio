import json
import os
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

ec2 = boto3.client("ec2")
scheduler = boto3.client("scheduler")

STANDBY_INSTANCE_ID = os.environ["STANDBY_INSTANCE_ID"]
EIP_ALLOCATION_ID = os.environ["EIP_ALLOCATION_ID"]

# 교체 Spot을 못 띄웠을 때 대기 인스턴스를 멈추기까지의 시간 (요청: 1시간)
STOP_STANDBY_AFTER_MINUTES = int(os.environ.get("STOP_STANDBY_AFTER_MINUTES", "60"))
SCHEDULER_ROLE_ARN = os.environ.get("SCHEDULER_ROLE_ARN", "")

# Spot 용량 부족을 뜻하는 EC2 오류 코드 (이 중 하나면 "용량 없음"으로 보고 예약을 건다)
CAPACITY_ERRORS = {
    "InsufficientInstanceCapacity",
    "SpotMaxPriceTooLow",
    "MaxSpotInstanceCountExceeded",
    "UnfulfillableCapacity",
}

# 교체용 Spot 인스턴스를 띄울 때 쓰는 값들 (Terraform이 Lambda 환경변수로 넣는다)
REGION = os.environ.get("REGION", "ap-northeast-2")
REPLACEMENT_AMI_ID = os.environ.get("REPLACEMENT_AMI_ID", "")
REPLACEMENT_SUBNET_ID = os.environ.get("REPLACEMENT_SUBNET_ID", "")
REPLACEMENT_SECURITY_GROUP_ID = os.environ.get("REPLACEMENT_SECURITY_GROUP_ID", "")
REPLACEMENT_KEY_NAME = os.environ.get("REPLACEMENT_KEY_NAME", "")
REPLACEMENT_INSTANCE_PROFILE = os.environ.get("REPLACEMENT_INSTANCE_PROFILE", "")
REPLACEMENT_INSTANCE_TYPE = os.environ.get("REPLACEMENT_INSTANCE_TYPE", "t3.large")
GITHUB_REPO_URL = os.environ.get("GITHUB_REPO_URL", "")

BOOTSTRAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spot_bootstrap.sh")


def build_user_data() -> str:
    """교체용 인스턴스의 부팅 스크립트에 실제 값을 채워 넣는다.

    값은 전부 Lambda 환경변수에서 온다. 비밀값은 여기에 들어가지 않는다 (스크립트가 SSM에서 직접 읽는다).
    """
    with open(BOOTSTRAP_PATH, encoding="utf-8") as f:
        script = f.read()
    return (
        script.replace("__REGION__", REGION)
        .replace("__GITHUB_REPO_URL__", GITHUB_REPO_URL)
        .replace("__EIP_ALLOCATION_ID__", EIP_ALLOCATION_ID)
        .replace("__STANDBY_INSTANCE_ID__", STANDBY_INSTANCE_ID)
    )


def launch_replacement_spot() -> str:
    """Spot 인스턴스를 새로 띄운다. 준비가 끝나면 스스로 공인 IP를 가져간다 (spot_bootstrap.sh)."""
    resp = ec2.run_instances(
        ImageId=REPLACEMENT_AMI_ID,
        InstanceType=REPLACEMENT_INSTANCE_TYPE,
        KeyName=REPLACEMENT_KEY_NAME,
        MinCount=1,
        MaxCount=1,
        SubnetId=REPLACEMENT_SUBNET_ID,
        SecurityGroupIds=[REPLACEMENT_SECURITY_GROUP_ID],
        IamInstanceProfile={"Name": REPLACEMENT_INSTANCE_PROFILE},
        UserData=build_user_data(),
        InstanceMarketOptions={"MarketType": "spot", "SpotOptions": {"SpotInstanceType": "one-time"}},
        BlockDeviceMappings=[{"DeviceName": "/dev/sda1", "Ebs": {"VolumeSize": 30, "VolumeType": "gp3"}}],
        TagSpecifications=[
            {"ResourceType": "instance", "Tags": [{"Key": "Name", "Value": "aiops-platform-spot"}]},
        ],
    )
    return resp["Instances"][0]["InstanceId"]


def schedule_standby_stop(function_arn: str) -> str:
    """N분 뒤 대기 인스턴스를 멈추는 일회성 예약을 건다. 예약 이름을 돌려준다."""
    when = datetime.now(timezone.utc) + timedelta(minutes=STOP_STANDBY_AFTER_MINUTES)
    name = f"stop-standby-{when.strftime('%Y%m%d%H%M%S')}"
    scheduler.create_schedule(
        Name=name,
        ScheduleExpression=f"at({when.strftime('%Y-%m-%dT%H:%M:%S')})",
        ScheduleExpressionTimezone="UTC",
        FlexibleTimeWindow={"Mode": "OFF"},
        ActionAfterCompletion="DELETE",
        Target={
            "Arn": function_arn,
            "RoleArn": SCHEDULER_ROLE_ARN,
            "Input": json.dumps({"action": "stop-standby"}),
        },
    )
    return name


def stop_standby() -> dict:
    """예약으로 호출된다. 교체 인스턴스가 못 뜬 상태에서만 대기 인스턴스를 멈춘다."""
    ec2.stop_instances(InstanceIds=[STANDBY_INSTANCE_ID])
    print("standby stop requested:", STANDBY_INSTANCE_ID)
    return {"status": "standby-stopped", "standby": STANDBY_INSTANCE_ID}


def handler(event, context):
    # 예약된 중지 요청 (schedule_standby_stop이 만든 예약이 호출한다)
    if isinstance(event, dict) and event.get("action") == "stop-standby":
        return stop_standby()

    print("failover triggered by:", event.get("detail-type"), event.get("detail", {}).get("instance-id"))

    # 1) 사용자 영향을 먼저 줄인다: 대기 인스턴스를 켜고 공인 IP를 옮긴다 (기존 동작)
    ec2.start_instances(InstanceIds=[STANDBY_INSTANCE_ID])
    ec2.get_waiter("instance_running").wait(
        InstanceIds=[STANDBY_INSTANCE_ID],
        WaiterConfig={"Delay": 5, "MaxAttempts": 60},
    )
    ec2.associate_address(
        AllocationId=EIP_ALLOCATION_ID,
        InstanceId=STANDBY_INSTANCE_ID,
        AllowReassociation=True,
    )

    # 2) 교체용 Spot을 띄운다. 준비가 끝나면 그 인스턴스가 공인 IP를 가져가고 대기 인스턴스를 끈다
    try:
        replacement = launch_replacement_spot()
    except ClientError as err:
        code = err.response["Error"]["Code"]
        if code not in CAPACITY_ERRORS:
            raise
        # 용량이 없으면 교체 인스턴스가 없다. 대기 인스턴스가 요금을 계속 내지 않도록 예약을 건다
        name = schedule_standby_stop(context.invoked_function_arn)
        print("spot capacity unavailable:", code, "- standby stop scheduled:", name)
        return {
            "status": "replacement-capacity-unavailable",
            "standby": STANDBY_INSTANCE_ID,
            "stop_schedule": name,
            "stop_after_minutes": STOP_STANDBY_AFTER_MINUTES,
        }

    print("replacement spot launched:", replacement)
    return {"status": "failover-complete", "standby": STANDBY_INSTANCE_ID, "replacement": replacement}
