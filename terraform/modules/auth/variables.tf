variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "sessions_table_name" {
  description = "Name of the DynamoDB Sessions table"
  type        = string
}

variable "sessions_table_arn" {
  description = "ARN of the DynamoDB Sessions table"
  type        = string
}

variable "users_table_name" {
  description = "Name of the DynamoDB Users table"
  type        = string
}

variable "users_table_arn" {
  description = "ARN of the DynamoDB Users table"
  type        = string
}

variable "jwt_secret" {
  description = "Secret key for JWT token signing and verification"
  type        = string
  sensitive   = true
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption/decryption"
  type        = string
}

variable "cors_origin" {
  description = "CORS origin for API responses"
  type        = string
  default     = "http://localhost:5173"
}
