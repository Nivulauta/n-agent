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
