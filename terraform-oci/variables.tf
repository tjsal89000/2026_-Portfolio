variable "tenancy_ocid" {
  description = "테넌시 OCID (~/.oci/config의 tenancy 값). 루트 컴파트먼트로 쓴다. 실제 값은 gitignore된 terraform.tfvars에 둔다."
  type        = string
}

variable "region" {
  description = "홈 리전. 무료 A1 인스턴스는 홈 리전에서만 만들 수 있다."
  type        = string
  default     = "ap-osaka-1"
}

variable "instance_ocpus" {
  description = "A1 Flex 무료 한도는 전체 4 OCPU / 24GB. 이 인스턴스가 그 한도를 전부 쓴다."
  type        = number
  default     = 4
}

variable "instance_memory_gb" {
  type    = number
  default = 24
}

variable "allowed_ssh_cidr" {
  description = "SSH(22)와 n8n(30678)을 허용할 CIDR. AWS와 같이 관리자 IP로 좁힌다 - terraform.tfvars에 본인 IP/32로 설정."
  type        = string
  default     = "0.0.0.0/0"
}

variable "github_repo_url" {
  description = "EC2/OCI 인스턴스가 clone할 소스 저장소 (AWS 버전과 동일)"
  type        = string
  default     = "https://github.com/tjsal89000/2026_-Portfolio.git"
}
