variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "authorizer_function_arn" {
  description = "ARN of the Lambda Authorizer function"
  type        = string
}

variable "authorizer_invoke_arn" {
  description = "Invoke ARN of the Lambda Authorizer function"
  type        = string
}

variable "login_function_name" {
  description = "Name of the Login Lambda function"
  type        = string
}

variable "login_invoke_arn" {
  description = "Invoke ARN of the Login Lambda function"
  type        = string
}

variable "logout_function_name" {
  description = "Name of the Logout Lambda function"
  type        = string
}

variable "logout_invoke_arn" {
  description = "Invoke ARN of the Logout Lambda function"
  type        = string
}

variable "document_upload_function_name" {
  description = "Name of the Document Upload Lambda function"
  type        = string
}

variable "document_upload_invoke_arn" {
  description = "Invoke ARN of the Document Upload Lambda function"
  type        = string
}

variable "document_list_function_name" {
  description = "Name of the Document List Lambda function"
  type        = string
}

variable "document_list_invoke_arn" {
  description = "Invoke ARN of the Document List Lambda function"
  type        = string
}

variable "document_delete_function_name" {
  description = "Name of the Document Delete Lambda function"
  type        = string
}

variable "document_delete_invoke_arn" {
  description = "Invoke ARN of the Document Delete Lambda function"
  type        = string
}

variable "chat_history_function_name" {
  description = "Name of the Chat History Lambda function"
  type        = string
}

variable "chat_history_invoke_arn" {
  description = "Invoke ARN of the Chat History Lambda function"
  type        = string
}

variable "enable_waf" {
  description = "Enable AWS WAF for API Gateway"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Rate limit for WAF (requests per 5 minutes per IP)"
  type        = number
  default     = 2000
}

variable "waf_ip_allowlist" {
  description = "List of IP addresses or CIDR blocks to allow (empty = allow all)"
  type        = list(string)
  default     = []
}

variable "waf_ip_blocklist" {
  description = "List of IP addresses or CIDR blocks to block"
  type        = list(string)
  default     = []
}

variable "cors_origin" {
  description = "CORS origin for API responses"
  type        = string
  default     = "http://localhost:5173"
}

variable "authorizer_function_name" {
  description = "Name of the Lambda Authorizer function"
  type        = string
}
