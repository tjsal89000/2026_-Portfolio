variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "standby_instance_id" {
  description = "장애 시 전환할 온디맨드 대기 인스턴스 ID (기존 terraform/ 에서 만든 인스턴스, 평소엔 중지 상태)"
  type        = string
}

variable "github_repo_url" {
  type    = string
  default = "https://github.com/tjsal89000/2026_-Portfolio.git"
}

variable "spot_instance_type" {
  type    = string
  default = "t3.large"
}
