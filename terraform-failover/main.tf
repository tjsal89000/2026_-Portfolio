# 기존 terraform/ 이 만든 키페어와 보안그룹을 이름으로 가져다 쓴다 (그 상태는 건드리지 않음)
data "aws_key_pair" "this" {
  key_name = "aiops-platform-key"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_security_group" "this" {
  name   = "aiops-platform-sg"
  vpc_id = data.aws_vpc.default.id
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 도메인이 가리키는 고정 IP. 인스턴스가 바뀌어도 이 EIP만 옮기면 DNS는 그대로다.
resource "aws_eip" "this" {
  domain = "vpc"

  tags = {
    Name = "aiops-platform-eip"
  }
}

# Spot 인스턴스가 부팅되면 스스로 EIP를 붙이도록 하는 권한
resource "aws_iam_role" "spot" {
  name = "aiops-platform-spot-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "spot" {
  name = "associate-eip"
  role = aws_iam_role.spot.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ec2:AssociateAddress", "ec2:DescribeAddresses"]
        Resource = "*"
      },
      {
        # Let's Encrypt DNS-01 인증(인증서 발급/갱신)용 - 이 호스티드 존의 레코드 변경만 허용
        Effect   = "Allow"
        Action   = ["route53:ChangeResourceRecordSets"]
        Resource = ["arn:aws:route53:::hostedzone/Z02079322BLZ8JMG4NAVK"]
      },
      {
        # 리소스 단위 권한이 없는 조회 API라 와일드카드로 줄 수밖에 없다
        Effect   = "Allow"
        Action   = ["route53:ListHostedZones", "route53:GetChange"]
        Resource = "*"
      },
      {
        # 인프라 현황 페이지가 EC2 목록을 조회하는 용도 (기존 terraform/의 ec2-describe-only와 동일 범위)
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
      },
      {
        # 운영 지표의 비용 패널이 Cost Explorer로 이번 달 비용을 읽는 용도 (조회 전용)
        Effect   = "Allow"
        Action   = ["ce:GetCostAndUsage"]
        Resource = "*"
      },
      {
        # 교체용 인스턴스가 비밀값을 SSM에서 읽는다 (/aiops/ 아래만)
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.region}:*:parameter/aiops/*"
      },
      {
        # 공개 서버의 sync 스크립트가 비밀값을 SSM에 쓴다 (/aiops/ 아래만)
        Effect   = "Allow"
        Action   = ["ssm:PutParameter"]
        Resource = "arn:aws:ssm:${var.region}:*:parameter/aiops/*"
      },
      {
        # 교체용 인스턴스가 준비되면 대기 인스턴스를 끈다 (대기 인스턴스 하나만)
        Effect   = "Allow"
        Action   = ["ec2:StopInstances"]
        Resource = "arn:aws:ec2:${var.region}:*:instance/${var.standby_instance_id}"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "spot" {
  name = "aiops-platform-spot-profile"
  role = aws_iam_role.spot.name
}

locals {
  # 부팅 직후 EIP를 자기 자신에게 연결하고, 그다음 기존 부트스트랩(Docker/k3s/빌드/배포)을 실행한다
  eip_bootstrap = <<-EOT
    #!/bin/bash
    apt-get update -y
    apt-get install -y awscli
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
    INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
    aws ec2 associate-address --region ${var.region} --allocation-id ${aws_eip.this.allocation_id} --instance-id $INSTANCE_ID --allow-reassociation
  EOT

  base_bootstrap = templatefile("${path.module}/../terraform/user_data.sh.tpl", {
    github_repo_url = var.github_repo_url
  })
}

resource "aws_instance" "spot" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.spot_instance_type
  key_name               = data.aws_key_pair.this.key_name
  vpc_security_group_ids = [data.aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.spot.name

  # Spot으로 싸게 돌리고, 회수되면 위의 Lambda가 온디맨드 대기 인스턴스로 넘긴다
  instance_market_options {
    market_type = "spot"
    spot_options {
      spot_instance_type = "one-time"
    }
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = "${local.eip_bootstrap}\n${local.base_bootstrap}"

  tags = {
    Name = "aiops-platform-spot"
  }
}

# --- 장애 전환 Lambda ---

data "archive_file" "failover" {
  type        = "zip"
  output_path = "${path.module}/lambda/failover.zip"

  # 교체용 인스턴스의 부팅 스크립트(spot_bootstrap.sh)도 같이 넣는다. 테스트 파일은 제외한다.
  source {
    filename = "failover.py"
    content  = file("${path.module}/lambda/failover.py")
  }
  source {
    filename = "spot_bootstrap.sh"
    content  = file("${path.module}/lambda/spot_bootstrap.sh")
  }
}

resource "aws_iam_role" "failover" {
  name = "aiops-platform-failover-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "failover_logs" {
  role       = aws_iam_role.failover.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "failover" {
  name = "failover-ec2"
  role = aws_iam_role.failover.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ec2:StartInstances", "ec2:DescribeInstances"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ec2:AssociateAddress"]
        Resource = "*"
      },
      {
        # 교체용 Spot 인스턴스 생성 (Spot 한 번 요청, 같은 네트워크/보안그룹/프로필)
        Effect   = "Allow"
        Action   = ["ec2:RunInstances", "ec2:CreateTags"]
        Resource = "*"
      },
      {
        # 교체용 인스턴스에 instance profile을 붙이려면 역할 전달 권한이 필요하다
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = aws_iam_role.spot.arn
      }
    ]
  })
}

resource "aws_lambda_function" "failover" {
  function_name    = "aiops-platform-failover"
  role             = aws_iam_role.failover.arn
  handler          = "failover.handler"
  runtime          = "python3.12"
  timeout          = 600
  filename         = data.archive_file.failover.output_path
  source_code_hash = data.archive_file.failover.output_base64sha256

  environment {
    variables = {
      STANDBY_INSTANCE_ID              = var.standby_instance_id
      EIP_ALLOCATION_ID                = aws_eip.this.allocation_id
      REGION                           = var.region
      GITHUB_REPO_URL                  = var.github_repo_url
      REPLACEMENT_AMI_ID               = data.aws_ami.ubuntu.id
      REPLACEMENT_SUBNET_ID            = aws_instance.spot.subnet_id
      REPLACEMENT_SECURITY_GROUP_ID    = data.aws_security_group.this.id
      REPLACEMENT_KEY_NAME             = data.aws_key_pair.this.key_name
      REPLACEMENT_INSTANCE_PROFILE     = aws_iam_instance_profile.spot.name
      REPLACEMENT_INSTANCE_TYPE        = var.spot_instance_type
    }
  }
}

# Spot 회수 경고 이벤트(2분 전)를 받으면 Lambda 실행
resource "aws_cloudwatch_event_rule" "spot_interruption" {
  name        = "aiops-platform-spot-interruption"
  description = "Spot 회수 경고 시 장애 전환 Lambda 실행"

  event_pattern = jsonencode({
    source        = ["aws.ec2"]
    "detail-type" = ["EC2 Spot Instance Interruption Warning"]
  })
}

resource "aws_cloudwatch_event_target" "failover" {
  rule      = aws_cloudwatch_event_rule.spot_interruption.name
  target_id = "failover-lambda"
  arn       = aws_lambda_function.failover.arn
}

resource "aws_lambda_permission" "from_events" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.failover.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.spot_interruption.arn
}
