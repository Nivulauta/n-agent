variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "mcp_server_config_table_name" {
  description = "Name of the MCP Server Config DynamoDB table"
  type        = string
}

variable "mcp_server_config_table_arn" {
  description = "ARN of the MCP Server Config DynamoDB table"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption"
  type        = string
}

variable "cors_origin" {
  description = "CORS origin for API responses"
  type        = string
  default     = "http://localhost:5173"
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
