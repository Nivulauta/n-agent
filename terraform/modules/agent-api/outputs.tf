output "mcp_servers_function_name" {
  description = "Name of the MCP Servers Lambda function"
  value       = aws_lambda_function.mcp_servers.function_name
}

output "mcp_servers_function_arn" {
  description = "ARN of the MCP Servers Lambda function"
  value       = aws_lambda_function.mcp_servers.arn
}

output "mcp_servers_invoke_arn" {
  description = "Invoke ARN of the MCP Servers Lambda function"
  value       = aws_lambda_function.mcp_servers.invoke_arn
}
