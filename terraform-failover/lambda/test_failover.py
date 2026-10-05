import os
import re
import sys
import unittest
from unittest import mock

from botocore.exceptions import ClientError

os.environ.setdefault("STANDBY_INSTANCE_ID", "i-standby")
os.environ.setdefault("EIP_ALLOCATION_ID", "eipalloc-test")
os.environ.setdefault("REPLACEMENT_AMI_ID", "ami-test")
os.environ.setdefault("REPLACEMENT_SUBNET_ID", "subnet-test")
os.environ.setdefault("REPLACEMENT_SECURITY_GROUP_ID", "sg-test")
os.environ.setdefault("REPLACEMENT_KEY_NAME", "key-test")
os.environ.setdefault("REPLACEMENT_INSTANCE_PROFILE", "profile-test")
os.environ.setdefault("GITHUB_REPO_URL", "https://example.com/repo.git")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import failover  # noqa: E402

FUNCTION_ARN = "arn:aws:lambda:ap-northeast-2:1:function:f"


def capacity_error(code="InsufficientInstanceCapacity"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "RunInstances")


class BuildUserDataTest(unittest.TestCase):
    def test_placeholders_are_replaced(self):
        user_data = failover.build_user_data()
        # 실제 자리표시자(__REGION__ 같은 값)가 남아 있으면 치환 누락이다. 주석의 __XXX__ 문구는 제외한다.
        self.assertIsNone(re.search(r"__(REGION|GITHUB_REPO_URL|EIP_ALLOCATION_ID|STANDBY_INSTANCE_ID)__", user_data))
        self.assertIn("https://example.com/repo.git", user_data)
        self.assertIn(failover.EIP_ALLOCATION_ID, user_data)

    def test_no_secret_values_in_user_data(self):
        user_data = failover.build_user_data().lower()
        self.assertNotIn("begin private key", user_data)
        self.assertNotIn("aws_secret", user_data)


class FirstFailoverTest(unittest.TestCase):
    def test_standby_is_started_and_takes_eip_before_replacement_launch(self):
        calls = []
        fake_ec2 = mock.MagicMock()
        fake_ec2.start_instances.side_effect = lambda **kw: calls.append("start_standby")
        fake_ec2.associate_address.side_effect = lambda **kw: calls.append("associate_eip_standby")
        fake_ec2.run_instances.side_effect = lambda **kw: (
            calls.append("launch_replacement"),
            {"Instances": [{"InstanceId": "i-new"}]},
        )[1]

        with mock.patch.object(failover, "ec2", fake_ec2):
            result = failover.handler({"detail-type": "EC2 Spot Instance Interruption Warning"}, None)

        self.assertEqual(calls, ["start_standby", "associate_eip_standby", "launch_replacement"])
        self.assertEqual(result["replacement"], "i-new")

    def test_replacement_is_one_time_spot_with_expected_network_and_profile(self):
        fake_ec2 = mock.MagicMock()
        fake_ec2.run_instances.return_value = {"Instances": [{"InstanceId": "i-new"}]}

        with mock.patch.object(failover, "ec2", fake_ec2):
            failover.launch_replacement_spot()

        kwargs = fake_ec2.run_instances.call_args.kwargs
        self.assertEqual(kwargs["InstanceMarketOptions"]["MarketType"], "spot")
        self.assertEqual(kwargs["InstanceMarketOptions"]["SpotOptions"]["SpotInstanceType"], "one-time")
        self.assertEqual(kwargs["SubnetId"], "subnet-test")
        self.assertEqual(kwargs["SecurityGroupIds"], ["sg-test"])
        self.assertEqual(kwargs["IamInstanceProfile"], {"Name": "profile-test"})


class CapacityRetryTest(unittest.TestCase):
    def _first_failover_with(self, error):
        fake_ec2 = mock.MagicMock()
        fake_scheduler = mock.MagicMock()
        fake_ec2.run_instances.side_effect = error
        context = mock.MagicMock(invoked_function_arn=FUNCTION_ARN)
        with mock.patch.object(failover, "ec2", fake_ec2), mock.patch.object(failover, "scheduler", fake_scheduler):
            result = failover.handler({"detail-type": "EC2 Spot Instance Interruption Warning"}, context)
        return result, fake_ec2, fake_scheduler

    def test_capacity_error_creates_five_minute_retry_and_one_hour_give_up(self):
        result, _, scheduler = self._first_failover_with(capacity_error())

        self.assertEqual(result["status"], "retrying-spot")
        self.assertEqual(result["retry_every_minutes"], 5)
        self.assertEqual(result["give_up_after_minutes"], 60)
        retry = scheduler.create_schedule.call_args_list[0].kwargs
        give_up = scheduler.create_schedule.call_args_list[1].kwargs
        self.assertEqual(retry["ScheduleExpression"], "rate(5 minutes)")
        self.assertTrue(give_up["ScheduleExpression"].startswith("at("))
        self.assertEqual(retry["Target"]["Arn"], FUNCTION_ARN)
        self.assertIn('"action": "retry-spot"', retry["Target"]["Input"])
        self.assertIn('"action": "give-up"', give_up["Target"]["Input"])
        self.assertEqual(retry["EndDate"] - retry["StartDate"], failover.timedelta(minutes=55))

    def test_non_capacity_error_is_raised_and_nothing_is_scheduled(self):
        with self.assertRaises(ClientError):
            self._first_failover_with(capacity_error("UnauthorizedOperation"))
        _, _, scheduler = self._first_failover_with(capacity_error())  # 정상 경로 비교용
        self.assertEqual(scheduler.create_schedule.call_count, 2)

    def test_retry_that_gets_spot_cancels_both_schedules(self):
        fake_ec2 = mock.MagicMock()
        fake_scheduler = mock.MagicMock()
        fake_ec2.run_instances.return_value = {"Instances": [{"InstanceId": "i-new"}]}
        event = {"action": "retry-spot", "retry_name": "retry-x", "give_up_name": "give-up-x"}

        with mock.patch.object(failover, "ec2", fake_ec2), mock.patch.object(failover, "scheduler", fake_scheduler):
            result = failover.handler(event, None)

        self.assertEqual(result["status"], "failover-complete")
        deleted = [c.kwargs["Name"] for c in fake_scheduler.delete_schedule.call_args_list]
        self.assertEqual(deleted, ["retry-x", "give-up-x"])

    def test_retry_without_capacity_keeps_waiting(self):
        fake_ec2 = mock.MagicMock()
        fake_scheduler = mock.MagicMock()
        fake_ec2.run_instances.side_effect = capacity_error()
        event = {"action": "retry-spot", "retry_name": "retry-x", "give_up_name": "give-up-x"}

        with mock.patch.object(failover, "ec2", fake_ec2), mock.patch.object(failover, "scheduler", fake_scheduler):
            result = failover.handler(event, None)

        self.assertEqual(result["status"], "retry-no-capacity")
        fake_scheduler.delete_schedule.assert_not_called()

    def test_give_up_stops_standby_when_no_replacement_exists(self):
        fake_ec2 = mock.MagicMock()
        fake_scheduler = mock.MagicMock()
        fake_ec2.describe_instances.return_value = {"Reservations": []}
        event = {"action": "give-up", "retry_name": "retry-x", "give_up_name": "give-up-x"}

        with mock.patch.object(failover, "ec2", fake_ec2), mock.patch.object(failover, "scheduler", fake_scheduler):
            result = failover.handler(event, None)

        fake_ec2.stop_instances.assert_called_once_with(InstanceIds=[failover.STANDBY_INSTANCE_ID])
        self.assertEqual(result["status"], "standby-stopped-after-retry-window")

    def test_give_up_keeps_standby_when_replacement_is_running(self):
        fake_ec2 = mock.MagicMock()
        fake_scheduler = mock.MagicMock()
        fake_ec2.describe_instances.return_value = {"Reservations": [{"Instances": [{"InstanceId": "i-new"}]}]}
        event = {"action": "give-up", "retry_name": "retry-x", "give_up_name": "give-up-x"}

        with mock.patch.object(failover, "ec2", fake_ec2), mock.patch.object(failover, "scheduler", fake_scheduler):
            result = failover.handler(event, None)

        fake_ec2.stop_instances.assert_not_called()
        self.assertEqual(result["status"], "replacement-running-standby-kept")


if __name__ == "__main__":
    unittest.main()
