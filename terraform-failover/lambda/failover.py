import os

import boto3

ec2 = boto3.client("ec2")

STANDBY_INSTANCE_ID = os.environ["STANDBY_INSTANCE_ID"]
EIP_ALLOCATION_ID = os.environ["EIP_ALLOCATION_ID"]

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


def handler(event, context):
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
    replacement = launch_replacement_spot()
    print("replacement spot launched:", replacement)
    return {"status": "failover-complete", "standby": STANDBY_INSTANCE_ID, "replacement": replacement}
