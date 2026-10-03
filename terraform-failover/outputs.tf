output "elastic_ip" {
  description = "도메인 A 레코드가 가리킬 고정 IP"
  value       = aws_eip.this.public_ip
}

output "spot_instance_id" {
  value = aws_instance.spot.id
}

output "failover_lambda" {
  value = aws_lambda_function.failover.function_name
}
