# Chat History Lambda Module Variables

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "chat_history_table_name" {
  description = "Name of the DynamoDB ChatHistory table"
  type        = string
}

variable "chat_history_table_arn" {
  description = "ARN of the DynamoDB ChatHistory table"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for message encryption/decryption"
  type        = string
}

variable "kms_key_id" {
  description = "ID of the KMS key for message encryption/decryption"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}
