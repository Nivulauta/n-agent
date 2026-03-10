variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "opensearch_instance_type" {
  description = "OpenSearch instance type"
  type        = string
  default     = "t3.medium.search"
}

variable "opensearch_instance_count" {
  description = "Number of OpenSearch instances"
  type        = number
  default     = 3
}

variable "opensearch_master_user_password" {
  description = "Master user password for OpenSearch (minimum 8 characters)"
  type        = string
  sensitive   = true
  default     = null
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in Redis cluster (1 for single node, 2+ for HA)"
  type        = number
  default     = 1
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots (0 to disable backups)"
  type        = number
  default     = 0
}

variable "redis_enable_encryption_at_rest" {
  description = "Enable encryption at rest for Redis (adds cost)"
  type        = bool
  default     = false
}

variable "redis_enable_encryption_in_transit" {
  description = "Enable encryption in transit for Redis (requires TLS)"
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address for SNS alert notifications (optional). If provided, email subscriptions will be created for all notification topics."
  type        = string
  default     = ""
}

variable "cors_origin" {
  description = "CORS origin for API responses (e.g., http://localhost:5173 for development, https://app.example.com for production). NOTE: This variable is deprecated - the system now automatically uses the frontend_url output from the frontend module."
  type        = string
  default     = "http://localhost:5173"
}
