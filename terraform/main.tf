# SSH 키페어를 미리 만들어와야 하는 수동 단계를 없애려고, Terraform이 직접 RSA 키를 생성해서
# AWS에 등록하고 개인키는 로컬 파일로 저장한다. "terraform apply 한 번으로 끝" 이라는 Phase 12
# 목표에 맞춰, "먼저 AWS 콘솔에서 키페어 만들고..." 같은 선행 수작업을 없앤 것.
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = "aiops-platform-key"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_file" "private_key" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/generated_key.pem"
  file_permission = "0600"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

# 이 프로젝트 규모(단일 인스턴스 데모)에서는 커스텀 VPC를 새로 만들 이점이 없어서
# 기본 VPC를 그대로 쓴다 - Strimzi Operator 대신 플레인 Kafka 컨테이너를 선택했던 것과
# 같은 논리(ADR-3): 오퍼레이터/커스텀 네트워크는 "그 복잡도를 감당할 규모"일 때 가치가 있다.
resource "aws_security_group" "this" {
  name        = "aiops-platform-sg"
  description = "payment-aiops-platform EC2 security group"
  vpc_id      = data.aws_vpc.default.id

  # AWS 보안그룹 description은 ASCII만 허용해서(한글 불가) 영어로 적고, 맥락은 주석으로 남긴다.
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # HTTPS - 인증서는 nginx가 종료한다
  ingress {
    description = "HTTPS (nginx gateway)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP 기본 포트 - 도메인을 포트 없이 열기 위해 k3s 서비스 로드밸런서가 80번으로 노출
  ingress {
    description = "HTTP (nginx gateway)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # nginx 게이트웨이 (모든 서비스의 단일 진입점) - k8s Service가 NodePort 30080으로 노출
  ingress {
    description = "web dashboard / gateway (nginx NodePort)"
    from_port   = 30080
    to_port     = 30080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # n8n - 서브패스 프록시 이슈로 로컬과 동일하게 자기 포트로 직접 노출 (NodePort).
  # n8n Community 버전은 "읽기 전용" 계정을 지원하지 않아서(뷰어 롤은 Enterprise 전용
  # 기능), 로그인만 하면 워크플로우를 수정할 수 있다 - 그래서 SSH와 마찬가지로 관리자
  # 본인 IP에서만 접근 가능하게 좁힌다. 포트폴리오로 "보여줄" 용도는 스크린샷/녹화로 대체.
  ingress {
    description = "n8n (NodePort, admin only)"
    from_port   = 30678
    to_port     = 30678
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# "인프라 현황" 대시보드 페이지가 EC2 목록을 조회할 때, 정적 AWS 키를 앱 설정에 박아넣지 않고
# 이 인스턴스 프로파일(IAM Role)을 통해 조회하게 한다. 조회(Describe)만 허용하는 최소 권한 -
# 이 인스턴스가 자기 자신을 포함한 EC2 목록을 "볼" 수는 있어도 생성/삭제/변경은 못 한다.
resource "aws_iam_role" "ec2_describe" {
  name = "aiops-platform-ec2-describe-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ec2_describe" {
  name = "ec2-describe-only"
  role = aws_iam_role.ec2_describe.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ec2:DescribeInstances"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_instance_profile" "this" {
  name = "aiops-platform-instance-profile"
  role = aws_iam_role.ec2_describe.name
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name

  root_block_device {
    volume_size = 30 # Docker 이미지 9개 + Kafka/Postgres 데이터까지 담아야 해서 기본 8GB보다 넉넉하게
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    github_repo_url = var.github_repo_url
  })

  tags = {
    Name = "aiops-platform"
  }
}
