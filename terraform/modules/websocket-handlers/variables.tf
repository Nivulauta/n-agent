variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "connections_table_name" {
  description = "Name of the DynamoDB connections table"
  type        = string
}

variable "connections_table_arn" {
  description = "ARN of the DynamoDB connections table"
  type        = string
}

variable "websocket_api_id" {
  description = "WebSocket API Gateway ID"
  type        = string
}

variable "websocket_api_execution_arn" {
  description = "WebSocket API Gateway execution ARN"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption/decryption"
  type        = string
}

variable "rate_limits_table_name" {
  description = "Name of the DynamoDB rate limits table"
  type        = string
}

variable "rate_limits_table_arn" {
  description = "ARN of the DynamoDB rate limits table"
  type        = string
}

variable "chat_history_table_name" {
  description = "Name of the DynamoDB chat history table"
  type        = string
}

variable "chat_history_table_arn" {
  description = "ARN of the DynamoDB chat history table"
  type        = string
}

variable "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  type        = string
}

variable "opensearch_domain_arn" {
  description = "OpenSearch domain ARN"
  type        = string
}

variable "cache_endpoint" {
  description = "Redis cache endpoint"
  type        = string
}

variable "cache_port" {
  description = "Redis cache port"
  type        = number
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions"
  type        = string
}

variable "mcp_server_config_table_name" {
  description = "Name of the DynamoDB MCP server config table"
  type        = string
}

variable "mcp_server_config_table_arn" {
  description = "ARN of the DynamoDB MCP server config table"
  type        = string
}

variable "use_bedrock_agent" {
  description = "Feature flag to enable Bedrock inline agent functionality"
  type        = bool
  default     = false
}

variable "agent_foundation_model" {
  description = "Bedrock foundation model ID for the inline agent"
  type        = string
  default     = "anthropic.claude-haiku-4-5"
}

variable "agent_max_iterations" {
  description = "Maximum number of tool calls per agent turn"
  type        = number
  default     = 10
}
