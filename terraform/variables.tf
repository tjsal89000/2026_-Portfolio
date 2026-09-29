variable "aws_region" {
  description = "리전 - 서울"
  type        = string
  default     = "ap-northeast-2"
}

variable "instance_type" {
  description = "Kafka+Postgres+Redis+관측성 스택+앱 9종을 한 노드에 다 올려야 해서, 최소 8GB RAM급인 t3.large를 기본값으로 둔다. 이것도 리소스 요청량 합산 기준으로는 빠듯한 편이라, Pod가 OOMKilled되면 t3.xlarge로 올리는 걸 권장(그만큼 시간당 비용도 올라감 - 포트폴리오 규모에서의 실제 트레이드오프)."
  type        = string
  default     = "t3.large"
}

variable "github_repo_url" {
  description = "EC2가 clone할 소스 저장소 (Phase 11에서 만든 Dockerfile들과 k8s/ 매니페스트가 여기 들어있음)"
  type        = string
  default     = "https://github.com/tjsal89000/2026_-Portfolio.git"
}

variable "allowed_ssh_cidr" {
  description = "SSH(22번 포트) 접근을 허용할 CIDR. 포트폴리오 데모라 기본값을 0.0.0.0/0으로 뒀지만, 실무라면 본인 IP로 좁혀야 하는 부분 - terraform.tfvars에서 재정의 권장."
  type        = string
  default     = "0.0.0.0/0"
}
