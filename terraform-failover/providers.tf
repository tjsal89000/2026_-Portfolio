terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# 인증은 로컬 AWS CLI 프로필(기존 terraform/과 같은 계정)을 쓴다 - 키 값은 저장소에 없다.
provider "aws" {
  region = var.region
}
