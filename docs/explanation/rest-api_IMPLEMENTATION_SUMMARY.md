# REST API Module Implementation Summary

## Overview

This document summarizes the implementation of the REST API Gateway module for the AWS Claude RAG Chatbot, including throttling and AWS WAF configuration as specified in tasks 19.1 and 19.2.

## Task 19.1: REST API Configuration ✅

### Resources Created

1. **API Gateway REST API**
   - Regional endpoint for lower latency
   - Custom Lambda Authorizer with 5-minute caching
   - Structured CloudWatch logging with 365-day retention

2. **API Endpoints**
   - `POST /auth/login` - User authentication (no auth required)
   - `POST /auth/logout` - Session termination (requires auth)
   - `GET /documents` - List user documents (requires auth)
   - `POST /documents/upload` - Generate presigned upload URL (requires auth)
   - `DELETE /documents/{documentId}` - Delete document (requires auth)
   - `GET /chat/history` - Retrieve conversation history (requires auth)

3. **Request/Response Models**
   - LoginRequest/LoginResponse with JSON schema validation
   - UploadRequest/UploadResponse with file size and type constraints
   - ErrorResponse for consistent error handling

4. **Request Validators**
   - Body validator for POST requests
   - Parameters validator for GET/DELETE requests
   - All validator for combined validation

5. **CORS Configuration**
   - OPTIONS methods for all endpoints
   - Wildcard origin support (`*`)
   - Proper headers configuration for browser access

## Task 19.2: Throttling and WAF Configuration ✅

### API Gateway Throttling

Configured at the method settings level:
- **Burst Limit**: 100 requests
- **Rate Limit**: 50 requests/second
- Applied to all methods (`*/*`)

This provides the first layer of protection against abuse at the API Gateway level.

### AWS WAF Configuration

#### WAF Web ACL
Created a comprehensive WAF Web ACL with multiple protection layers:

1. **Rate-Based Rule (Priority 1)**
   - Default: 2000 requests per 5 minutes per IP
   - Configurable via `waf_rate_limit` variable
   - Blocks IPs exceeding threshold
   - Automatic unblocking after 5 minutes

2. **AWS Managed Rules - Common Rule Set (Priority 2)**
   - Protects against OWASP Top 10 vulnerabilities
   - Common web exploits protection
   - Some rules set to COUNT mode to avoid false positives:
     - `SizeRestrictions_BODY` - Allows larger request bodies
     - `GenericRFI_BODY` - Reduces false positives for legitimate requests

3. **AWS Managed Rules - Known Bad Inputs (Priority 3)**
   - Blocks requests with known malicious patterns
   - Malformed request detection
   - Known attack signature blocking

4. **AWS Managed Rules - SQL Injection (Priority 4)**
   - SQL injection pattern detection
   - Malicious SQL query blocking
   - Database protection

#### IP Filtering

Optional IP-based access control:
- **IP Blocklist**: Block specific IPs or CIDR ranges
- **IP Allowlist**: Allow only specific IPs (optional)
- Blocklist has priority 0 (evaluated first)

#### WAF Logging

- CloudWatch Logs: `/aws/wafv2/{environment}-chatbot-api`
- 365-day retention for compliance
- Sensitive header redaction:
  - Authorization header
  - Cookie header
- CloudWatch metrics for each rule
- Sampled requests for analysis

#### Configuration Options

The module provides flexible WAF configuration:

```hcl
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
  description = "List of IP addresses or CIDR blocks to allow"
  type        = list(string)
  default     = []
}

variable "waf_ip_blocklist" {
  description = "List of IP addresses or CIDR blocks to block"
  type        = list(string)
  default     = []
}
```

## Security Layers

The implementation provides multiple security layers:

1. **API Gateway Throttling** (50 req/sec, 100 burst)
   - Fast, immediate protection
   - Prevents overwhelming backend services

2. **WAF Rate Limiting** (2000 req/5min per IP)
   - Longer-term abuse prevention
   - Per-IP tracking across 5-minute windows

3. **WAF Managed Rules**
   - Protection against common vulnerabilities
   - SQL injection prevention
   - Known bad input blocking

4. **IP Filtering**
   - Blocklist for known malicious IPs
   - Optional allowlist for restricted access

5. **Lambda Authorizer**
   - JWT token validation
   - Session verification
   - 5-minute result caching

6. **Request Validation**
   - JSON schema validation
   - Required field enforcement
   - Type and constraint checking

## Monitoring and Observability

### CloudWatch Logs
- API Gateway access logs: `/aws/apigateway/{environment}-chatbot-api`
- WAF logs: `/aws/wafv2/{environment}-chatbot-api`
- Both with 365-day retention

### CloudWatch Metrics
- Request count and latency
- 4XX/5XX error rates
- Authorizer cache hit/miss
- WAF rule matches and blocks
- Rate limit violations

### WAF Visibility
- Sampled requests for each rule
- Detailed blocking reasons
- IP-based traffic analysis
- Rule effectiveness metrics

## Cost Optimization

1. **Authorizer Caching**: 5-minute TTL reduces Lambda invocations
2. **Regional Endpoint**: Lower latency and cost vs edge-optimized
3. **Conditional WAF**: Can be disabled for dev environments
4. **Managed Rules**: No custom rule maintenance overhead
5. **Efficient Logging**: Redacted sensitive data reduces storage

## Compliance and Audit

- 365-day log retention meets most compliance requirements
- Comprehensive audit trail of all requests
- Sensitive data redaction in WAF logs
- Structured JSON logging for easy analysis
- CloudWatch Logs Insights for querying

## Usage Example

```hcl
module "rest_api" {
  source = "./modules/rest-api"

  environment = "prod"
  
  # Lambda function references
  authorizer_function_arn       = module.auth.authorizer_function_arn
  authorizer_invoke_arn         = module.auth.authorizer_invoke_arn
  login_function_name           = module.auth.login_function_name
  login_invoke_arn              = module.auth.login_invoke_arn
  logout_function_name          = module.auth.logout_function_name
  logout_invoke_arn             = module.auth.logout_invoke_arn
  document_upload_function_name = module.documents.upload_function_name
  document_upload_invoke_arn    = module.documents.upload_invoke_arn
  document_list_function_name   = module.documents.list_function_name
  document_list_invoke_arn      = module.documents.list_invoke_arn
  document_delete_function_name = module.documents.delete_function_name
  document_delete_invoke_arn    = module.documents.delete_invoke_arn
  chat_history_function_name    = module.chat.history_function_name
  chat_history_invoke_arn       = module.chat.history_invoke_arn
  
  # WAF configuration
  enable_waf       = true
  waf_rate_limit   = 2000
  waf_ip_blocklist = ["192.0.2.0/24"] # Example: block a CIDR range
  waf_ip_allowlist = []                # Empty = allow all (except blocklist)
}
```

## Testing Recommendations

1. **Throttling Tests**
   - Send 100+ requests in quick succession
   - Verify 429 responses after burst limit
   - Confirm rate limit enforcement

2. **WAF Tests**
   - Test rate limit with sustained traffic
   - Attempt SQL injection patterns
   - Test IP blocklist functionality
   - Verify legitimate traffic passes through

3. **Request Validation Tests**
   - Send invalid JSON schemas
   - Test missing required fields
   - Test invalid data types
   - Verify proper error messages

4. **CORS Tests**
   - Send OPTIONS preflight requests
   - Verify CORS headers in responses
   - Test from browser environment

## Requirements Satisfied

- **Requirement 13.5**: Infrastructure as Code deployment ✅
- **Requirement 10.1**: Rate limiting enforcement ✅
- **Requirement 11.1**: Comprehensive audit logging ✅
- **Security best practices**: Multiple protection layers ✅

## Next Steps

1. Deploy the module to a test environment
2. Run integration tests with actual traffic
3. Monitor CloudWatch metrics and logs
4. Tune WAF rules based on traffic patterns
5. Configure CloudWatch alarms for anomalies
6. Document any IP addresses for blocklist/allowlist
7. Set up custom domain with ACM certificate (optional)

## Notes

- WAF is enabled by default but can be disabled for dev environments
- Rate limits are configurable but defaults follow requirements
- All sensitive data is redacted from logs
- The module is fully self-contained and reusable
- CloudWatch Logs Insights can be used for advanced log analysis
