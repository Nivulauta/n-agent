output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = aws_vpc.main.cidr_block
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "nat_gateway_id" {
  description = "NAT Gateway ID (null when using NAT instance)"
  value       = var.use_nat_instance ? null : aws_nat_gateway.main[0].id
}

output "nat_instance_id" {
  description = "NAT Instance ID (null when using NAT Gateway)"
  value       = var.use_nat_instance ? aws_instance.nat[0].id : null
}

output "s3_vpc_endpoint_id" {
  description = "S3 VPC Endpoint ID"
  value       = aws_vpc_endpoint.s3.id
}

output "dynamodb_vpc_endpoint_id" {
  description = "DynamoDB VPC Endpoint ID"
  value       = aws_vpc_endpoint.dynamodb.id
}

output "bedrock_vpc_endpoint_id" {
  description = "Bedrock VPC Endpoint ID"
  value       = aws_vpc_endpoint.bedrock.id
}

output "bedrock_agent_runtime_vpc_endpoint_id" {
  description = "Bedrock Agent Runtime VPC Endpoint ID"
  value       = aws_vpc_endpoint.bedrock_agent_runtime.id
}
