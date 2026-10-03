output "public_ip" {
  description = "인스턴스 퍼블릭 IP (대시보드 접속: http://<IP>:30080/dashboard/)"
  value       = oci_core_instance.this.public_ip
}

output "ssh_command" {
  value = "ssh -i ${path.module}/generated_key.pem ubuntu@${oci_core_instance.this.public_ip}"
}
