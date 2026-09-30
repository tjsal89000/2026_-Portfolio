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
  description = "SSH(22번)와 n8n(30678번, NodePort) 접근을 허용할 CIDR - 둘 다 '관리자만 봐야 하는' 포트라 같은 변수로 묶었다. 웹 대시보드(30080번)는 포트폴리오 목적상 누구나 봐야 해서 이 변수와 무관하게 계속 0.0.0.0/0. 기본값은 0.0.0.0/0이지만 terraform.tfvars에서 본인 IP(예: 1.2.3.4/32)로 반드시 좁혀야 함 - .gitignore에 걸려있어 실제 IP는 커밋되지 않는다."
  type        = string
  default     = "0.0.0.0/0"
}
