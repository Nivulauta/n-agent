# MCP Servers Lambda outputs
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

# Agent execution role outputs
output "agent_execution_role_arn" {
  description = "ARN of the agent execution IAM role (has bedrock:InvokeInlineAgent permission)"
  value       = aws_iam_role.agent_execution_role.arn
}

output "agent_execution_role_name" {
  description = "Name of the agent execution IAM role"
  value       = aws_iam_role.agent_execution_role.name
}
