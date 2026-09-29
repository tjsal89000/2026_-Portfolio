output "public_ip" {
  description = "EC2 퍼블릭 IP"
  value       = aws_instance.app.public_ip
}

output "dashboard_url" {
  description = "웹 대시보드(전체 서비스 단일 진입점) 주소"
  value       = "http://${aws_instance.app.public_ip}:30080/"
}

output "n8n_url" {
  description = "n8n 워크플로우 주소"
  value       = "http://${aws_instance.app.public_ip}:30678/"
}

output "ssh_command" {
  description = "SSH 접속 명령"
  value       = "ssh -i generated_key.pem ubuntu@${aws_instance.app.public_ip}"
}
