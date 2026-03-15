variable "environment" {
  description = "Environment name"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
}

variable "serpapi_mcp_url" {
  description = "SerpAPI MCP server URL (streamable-http transport)"
  type        = string
  default     = ""
}
