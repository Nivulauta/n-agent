# Frontend Module Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}

variable "cloudfront_oai_iam_arn" {
  description = "IAM ARN of CloudFront Origin Access Identity for bucket policy"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain name for CloudFront distribution (optional)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for custom domain (required if custom_domain is set)"
  type        = string
  default     = ""
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)"
  type        = string
  default     = "PriceClass_100"
}
