import os
import re
import sys
import unittest
from unittest import mock

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


class BuildUserDataTest(unittest.TestCase):
    def test_placeholders_are_replaced(self):
        user_data = failover.build_user_data()
        # 실제 자리표시자(__REGION__ 같은 값)가 남아 있으면 치환 누락이다. 주석의 __XXX__ 문구는 제외한다.
        self.assertIsNone(re.search(r"__(REGION|GITHUB_REPO_URL|EIP_ALLOCATION_ID|STANDBY_INSTANCE_ID)__", user_data))
        self.assertIn("https://example.com/repo.git", user_data)
        self.assertIn(failover.EIP_ALLOCATION_ID, user_data)
        self.assertIn(failover.STANDBY_INSTANCE_ID, user_data)

    def test_no_secret_values_in_user_data(self):
        user_data = failover.build_user_data().lower()
        self.assertNotIn("begin private key", user_data)
        self.assertNotIn("aws_secret", user_data)


class HandlerTest(unittest.TestCase):
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
        self.assertEqual(kwargs["MinCount"], 1)
        self.assertEqual(kwargs["MaxCount"], 1)


if __name__ == "__main__":
    unittest.main()
