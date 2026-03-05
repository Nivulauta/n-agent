variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "document_metadata_table_name" {
  description = "Name of the DocumentMetadata DynamoDB table"
  type        = string
}

variable "document_metadata_table_arn" {
  description = "ARN of the DocumentMetadata DynamoDB table"
  type        = string
}

variable "documents_bucket_name" {
  description = "Name of the S3 bucket for documents"
  type        = string
}

variable "documents_bucket_arn" {
  description = "ARN of the S3 bucket for documents"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption"
  type        = string
}

variable "opensearch_endpoint" {
  description = "OpenSearch domain endpoint (without https://)"
  type        = string
}

variable "opensearch_index" {
  description = "OpenSearch index name for documents"
  type        = string
  default     = "documents"
}

variable "opensearch_domain_arn" {
  description = "ARN of the OpenSearch domain"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions to access OpenSearch"
  type        = string
}

variable "cors_origin" {
  description = "CORS origin for API responses"
  type        = string
  default     = "http://localhost:5173"
}
