terraform {
  required_version = ">= 1.5"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

# 인증 정보는 ~/.oci/config(로컬)에서 읽는다 - 이 저장소에는 키 값이 들어가지 않는다.
provider "oci" {
  region = var.region
}
