import json
import os
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

ec2 = boto3.client("ec2")
scheduler = boto3.client("scheduler")

STANDBY_INSTANCE_ID = os.environ["STANDBY_INSTANCE_ID"]
EIP_ALLOCATION_ID = os.environ["EIP_ALLOCATION_ID"]
SCHEDULER_ROLE_ARN = os.environ.get("SCHEDULER_ROLE_ARN", "")

# Spot을 재시도하는 간격과 전체 기간 (요청: 5분 간격, 1시간)
RETRY_INTERVAL_MINUTES = int(os.environ.get("RETRY_INTERVAL_MINUTES", "5"))
RETRY_WINDOW_MINUTES = int(os.environ.get("RETRY_WINDOW_MINUTES", "60"))

# 교체용 Spot 인스턴스 설정 (Terraform이 Lambda 환경변수로 넣는다)
REGION = os.environ.get("REGION", "ap-northeast-2")
REPLACEMENT_AMI_ID = os.environ.get("REPLACEMENT_AMI_ID", "")
REPLACEMENT_SUBNET_ID = os.environ.get("REPLACEMENT_SUBNET_ID", "")
REPLACEMENT_SECURITY_GROUP_ID = os.environ.get("REPLACEMENT_SECURITY_GROUP_ID", "")
REPLACEMENT_KEY_NAME = os.environ.get("REPLACEMENT_KEY_NAME", "")
REPLACEMENT_INSTANCE_PROFILE = os.environ.get("REPLACEMENT_INSTANCE_PROFILE", "")
REPLACEMENT_INSTANCE_TYPE = os.environ.get("REPLACEMENT_INSTANCE_TYPE", "t3.large")
GITHUB_REPO_URL = os.environ.get("GITHUB_REPO_URL", "")

# Spot 용량 부족을 뜻하는 EC2 오류 코드 (이 중 하나면 재시도 대상)
CAPACITY_ERRORS = {
    "InsufficientInstanceCapacity",
    "SpotMaxPriceTooLow",
    "MaxSpotInstanceCountExceeded",
    "UnfulfillableCapacity",
}

BOOTSTRAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spot_bootstrap.sh")
LAUNCH_TAG_KEY = "launched-by"
LAUNCH_TAG_VALUE = "failover-lambda"


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
            {
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Name", "Value": "aiops-platform-spot"},
                    {"Key": LAUNCH_TAG_KEY, "Value": LAUNCH_TAG_VALUE},
                ],
            },
        ],
    )
    return resp["Instances"][0]["InstanceId"]


def replacement_exists() -> bool:
    """이 Lambda가 띄운 교체 인스턴스가 아직 떠 있는지 (대기 중이거나 실행 중)."""
    resp = ec2.describe_instances(
        Filters=[
            {"Name": f"tag:{LAUNCH_TAG_KEY}", "Values": [LAUNCH_TAG_VALUE]},
            {"Name": "instance-state-name", "Values": ["pending", "running"]},
        ]
    )
    return any(resp.get("Reservations", []))


def _delete_schedule(name: str) -> None:
    try:
        scheduler.delete_schedule(Name=name)
    except ClientError as err:
        if err.response["Error"]["Code"] != "ResourceNotFoundException":
            raise


def schedule_spot_retries(function_arn: str) -> dict:
    """5분마다 Spot 재시도 예약 + 1시간 뒤 마감 예약을 만든다. 두 예약 이름을 돌려준다."""
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%d%H%M%S")
    names = {"retry": f"retry-spot-{stamp}", "give_up": f"give-up-{stamp}"}
    end = now + timedelta(minutes=RETRY_WINDOW_MINUTES)
    body = {"retry_name": names["retry"], "give_up_name": names["give_up"]}

    scheduler.create_schedule(
        Name=names["retry"],
        ScheduleExpression=f"rate({RETRY_INTERVAL_MINUTES} minutes)",
        ScheduleExpressionTimezone="UTC",
        StartDate=now + timedelta(minutes=RETRY_INTERVAL_MINUTES),
        EndDate=end,
        FlexibleTimeWindow={"Mode": "OFF"},
        ActionAfterCompletion="DELETE",
        Target={
            "Arn": function_arn,
            "RoleArn": SCHEDULER_ROLE_ARN,
            "Input": json.dumps({"action": "retry-spot", **body}),
        },
    )
    scheduler.create_schedule(
        Name=names["give_up"],
        ScheduleExpression=f"at({end.strftime('%Y-%m-%dT%H:%M:%S')})",
        ScheduleExpressionTimezone="UTC",
        FlexibleTimeWindow={"Mode": "OFF"},
        ActionAfterCompletion="DELETE",
        Target={
            "Arn": function_arn,
            "RoleArn": SCHEDULER_ROLE_ARN,
            "Input": json.dumps({"action": "give-up", **body}),
        },
    )
    return names


def retry_spot(event: dict) -> dict:
    """재시도 예약이 호출한다. Spot이 잡히면 예약을 지우고 끝, 아니면 다음 재시도를 기다린다."""
    try:
        replacement = launch_replacement_spot()
    except ClientError as err:
        code = err.response["Error"]["Code"]
        if code in CAPACITY_ERRORS:
            print("spot still unavailable:", code)
            return {"status": "retry-no-capacity"}
        raise

    # Spot이 잡혔다: 남은 재시도와 마감 예약을 지운다 (교체 인스턴스가 공인 IP를 가져가고 대기 인스턴스를 끈다)
    _delete_schedule(event["retry_name"])
    _delete_schedule(event["give_up_name"])
    print("replacement spot launched on retry:", replacement)
    return {"status": "failover-complete", "replacement": replacement}


def give_up(event: dict) -> dict:
    """1시간 마감 예약이 호출한다. 교체 인스턴스가 없으면 대기 인스턴스를 끈다."""
    _delete_schedule(event["retry_name"])  # 아직 남은 재시도가 있으면 지운다
    if replacement_exists():
        print("replacement is running - standby kept")
        return {"status": "replacement-running-standby-kept"}

    ec2.stop_instances(InstanceIds=[STANDBY_INSTANCE_ID])
    print("no spot within retry window - standby stop requested:", STANDBY_INSTANCE_ID)
    return {"status": "standby-stopped-after-retry-window", "standby": STANDBY_INSTANCE_ID}


def handler(event, context):
    action = event.get("action") if isinstance(event, dict) else None
    if action == "retry-spot":
        return retry_spot(event)
    if action == "give-up":
        return give_up(event)

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
        # 용량이 없으면 5분마다 재시도하고, 1시간 안에 못 잡으면 대기 인스턴스를 끈다
        names = schedule_spot_retries(context.invoked_function_arn)
        print("spot capacity unavailable:", code, "- retries scheduled:", names)
        return {
            "status": "retrying-spot",
            "standby": STANDBY_INSTANCE_ID,
            "retry_every_minutes": RETRY_INTERVAL_MINUTES,
            "give_up_after_minutes": RETRY_WINDOW_MINUTES,
            "schedules": names,
        }

    print("replacement spot launched:", replacement)
    return {"status": "failover-complete", "standby": STANDBY_INSTANCE_ID, "replacement": replacement}
