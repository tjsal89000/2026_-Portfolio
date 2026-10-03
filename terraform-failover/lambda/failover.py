import os

import boto3

ec2 = boto3.client("ec2")

STANDBY_INSTANCE_ID = os.environ["STANDBY_INSTANCE_ID"]
EIP_ALLOCATION_ID = os.environ["EIP_ALLOCATION_ID"]


def handler(event, context):
    # Spot 회수 경고(2분 전)를 받으면 대기 온디맨드를 켜고, Elastic IP를 그쪽으로 옮긴다.
    # 도메인은 EIP를 가리키므로 DNS는 건드리지 않아도 된다.
    print("failover triggered by:", event.get("detail-type"), event.get("detail", {}).get("instance-id"))

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
    return {"status": "failover-complete", "standby": STANDBY_INSTANCE_ID}
