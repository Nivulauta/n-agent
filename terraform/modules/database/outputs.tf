output "sessions_table_name" {
  description = "Sessions table name"
  value       = aws_dynamodb_table.sessions.name
}

output "sessions_table_arn" {
  description = "Sessions table ARN"
  value       = aws_dynamodb_table.sessions.arn
}

output "chat_history_table_name" {
  description = "Chat History table name"
  value       = aws_dynamodb_table.chat_history.name
}

output "chat_history_table_arn" {
  description = "Chat History table ARN"
  value       = aws_dynamodb_table.chat_history.arn
}

output "rate_limits_table_name" {
  description = "Rate Limits table name"
  value       = aws_dynamodb_table.rate_limits.name
}

output "rate_limits_table_arn" {
  description = "Rate Limits table ARN"
  value       = aws_dynamodb_table.rate_limits.arn
}

output "document_metadata_table_name" {
  description = "Document Metadata table name"
  value       = aws_dynamodb_table.document_metadata.name
}

output "document_metadata_table_arn" {
  description = "Document Metadata table ARN"
  value       = aws_dynamodb_table.document_metadata.arn
}
output "users_table_name" {
  description = "Users table name"
  value       = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  description = "Users table ARN"
  value       = aws_dynamodb_table.users.arn
}

output "connections_table_name" {
  description = "WebSocket Connections table name"
  value       = aws_dynamodb_table.connections.name
}

output "connections_table_arn" {
  description = "WebSocket Connections table ARN"
  value       = aws_dynamodb_table.connections.arn
}

output "mcp_server_config_table_name" {
  description = "MCP Server Config table name"
  value       = aws_dynamodb_table.mcp_server_config.name
}

output "mcp_server_config_table_arn" {
  description = "MCP Server Config table ARN"
  value       = aws_dynamodb_table.mcp_server_config.arn
}
