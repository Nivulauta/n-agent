# REST API Gateway Module

This Terraform module creates a REST API Gateway for the Nivulauta Agent system with Lambda Authorizer integration, request/response validation, and comprehensive CORS support.

## Features

- REST API Gateway with regional endpoint
- Lambda Authorizer for token-based authentication
- Authentication endpoints (login, logout)
- Document management endpoints (upload, list, delete)
- Chat history endpoint
- Request/response model validation
- CORS configuration for browser access
- CloudWatch logging with 365-day retention
- Throttling (burst=100, rate=50 req/sec)
- AWS WAF with rate-based rules and managed rule sets
- IP allowlist/blocklist support
- Automatic deployment and staging

## Resources Created

1. **API Gateway REST API**
   - Regional endpoint configuration
   - Custom authorizer integration
   - Request/response logging
   - Request validators for body and parameters

2. **Lambda Authorizer**
   - Token-based authentication (Authorization header)
   - 5-minute result caching
   - IAM role for API Gateway to invoke authorizer

3. **Authentication Endpoints**
   - `POST /auth/login` - User login (no auth required)
   - `POST /auth/logout` - User logout (requires auth)

4. **Document Management Endpoints**
   - `GET /documents` - List user documents (requires auth)
   - `POST /documents/upload` - Generate presigned upload URL (requires auth)
   - `DELETE /documents/{documentId}` - Delete document (requires auth)

5. **Chat Endpoints**
   - `GET /chat/history` - Retrieve conversation history (requires auth)

6. **Request/Response Models**
   - LoginRequest/LoginResponse models
   - UploadRequest/UploadResponse models
   - ErrorResponse model
   - JSON Schema validation

7. **CORS Configuration**
   - OPTIONS methods for preflight requests
   - Configured headers and methods
   - Wildcard origin support

8. **CloudWatch Logging**
   - Access logs with structured JSON format
   - 365-day retention for compliance
   - Request/response tracing

9. **Throttling**
   - Burst limit: 100 requests
   - Rate limit: 50 requests/second
   - Applied to all methods

10. **AWS WAF (Web Application Firewall)**
    - Rate-based rule: 2000 requests per 5 minutes per IP
    - AWS Managed Rules: Common Rule Set
    - AWS Managed Rules: Known Bad Inputs
    - AWS Managed Rules: SQL Injection Protection
    - IP blocklist support
    - IP allowlist support (optional)
    - CloudWatch metrics and logging
    - Sensitive header redaction (Authorization, Cookie)

## Usage

```hcl
module "rest_api" {
  source = "./modules/rest-api"

  environment              = "dev"
  authorizer_function_arn  = module.auth.authorizer_function_arn
  authorizer_invoke_arn    = module.auth.authorizer_invoke_arn
  login_function_name      = module.auth.login_function_name
  login_invoke_arn         = module.auth.login_invoke_arn
  logout_function_name     = module.auth.logout_function_name
  logout_invoke_arn        = module.auth.logout_invoke_arn
}
```

## Inputs

| Name | Description | Type | Required |
|------|-------------|------|----------|
| environment | Environment name (e.g., dev, staging, prod) | string | yes |
| authorizer_function_arn | ARN of the Lambda Authorizer function | string | yes |
| authorizer_invoke_arn | Invoke ARN of the Lambda Authorizer function | string | yes |
| login_function_name | Name of the Login Lambda function | string | yes |
| login_invoke_arn | Invoke ARN of the Login Lambda function | string | yes |
| logout_function_name | Name of the Logout Lambda function | string | yes |
| logout_invoke_arn | Invoke ARN of the Logout Lambda function | string | yes |
| document_upload_function_name | Name of the Document Upload Lambda function | string | yes |
| document_upload_invoke_arn | Invoke ARN of the Document Upload Lambda function | string | yes |
| document_list_function_name | Name of the Document List Lambda function | string | yes |
| document_list_invoke_arn | Invoke ARN of the Document List Lambda function | string | yes |
| document_delete_function_name | Name of the Document Delete Lambda function | string | yes |
| document_delete_invoke_arn | Invoke ARN of the Document Delete Lambda function | string | yes |
| chat_history_function_name | Name of the Chat History Lambda function | string | yes |
| chat_history_invoke_arn | Invoke ARN of the Chat History Lambda function | string | yes |
| enable_waf | Enable AWS WAF for API Gateway | bool | no (default: true) |
| waf_rate_limit | Rate limit for WAF (requests per 5 minutes per IP) | number | no (default: 2000) |
| waf_ip_allowlist | List of IP addresses or CIDR blocks to allow | list(string) | no (default: []) |
| waf_ip_blocklist | List of IP addresses or CIDR blocks to block | list(string) | no (default: []) |

## Outputs

| Name | Description |
|------|-------------|
| rest_api_id | ID of the REST API |
| rest_api_execution_arn | Execution ARN of the REST API |
| rest_api_root_resource_id | Root resource ID for adding more resources |
| stage_url | Full URL of the API Gateway stage |
| stage_name | Name of the API Gateway stage |
| authorizer_id | ID of the Lambda Authorizer |
| body_validator_id | ID of the body request validator |
| params_validator_id | ID of the parameters request validator |
| all_validator_id | ID of the all (body + params) request validator |
| waf_web_acl_id | ID of the WAF Web ACL (null if WAF disabled) |
| waf_web_acl_arn | ARN of the WAF Web ACL (null if WAF disabled) |
| waf_web_acl_capacity | Capacity units used by the WAF Web ACL (null if WAF disabled) |

## API Endpoints

### POST /auth/login

Login endpoint (no authentication required). Request body is validated against LoginRequest model.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1234567890,
  "userId": "user-123"
}
```

### POST /auth/logout

Logout endpoint (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /documents

List user's documents (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "documents": [
    {
      "documentId": "doc-123",
      "filename": "report.pdf",
      "uploadedAt": 1234567890,
      "pageCount": 10,
      "status": "completed"
    }
  ],
  "nextToken": "optional-pagination-token"
}
```

### POST /documents/upload

Generate presigned URL for document upload (requires authentication). Request body is validated against UploadRequest model.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "filename": "report.pdf",
  "fileSize": 5242880,
  "contentType": "application/pdf"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "documentId": "doc-123",
  "expiresAt": 1234567890
}
```

### DELETE /documents/{documentId}

Delete a document (requires authentication). Path parameter is validated.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### GET /chat/history

Retrieve conversation history (requires authentication). Query parameters are validated.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `sessionId` (required): Session ID
- `limit` (optional): Number of messages to retrieve (default: 50)
- `nextToken` (optional): Pagination token

**Response:**
```json
{
  "messages": [
    {
      "messageId": "msg-123",
      "role": "user",
      "content": "What is the capital of France?",
      "timestamp": 1234567890
    },
    {
      "messageId": "msg-124",
      "role": "assistant",
      "content": "The capital of France is Paris.",
      "timestamp": 1234567891
    }
  ],
  "nextToken": "optional-pagination-token"
}
```

## Authentication

The Lambda Authorizer validates JWT tokens from the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

The authorizer:
1. Extracts the token from the Authorization header
2. Validates the JWT signature
3. Checks the session in DynamoDB
4. Returns an IAM policy allowing or denying access
5. Caches the result for 5 minutes

## CORS Configuration

CORS is enabled for browser access with the following configuration:

- **Allowed Origins:** `*` (wildcard)
- **Allowed Methods:** Varies by endpoint
  - `/auth/login`: `POST, OPTIONS`
  - `/auth/logout`: `POST, OPTIONS`
  - `/documents`: `GET, POST, OPTIONS`
  - `/documents/upload`: `POST, OPTIONS`
  - `/documents/{documentId}`: `DELETE, OPTIONS`
  - `/chat/history`: `GET, OPTIONS`
- **Allowed Headers:** `Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token`

## Request Validation

The API uses three types of request validators:

1. **Body Validator** - Validates request body against JSON schema
   - Used for: `POST /auth/login`, `POST /documents/upload`
   
2. **Parameters Validator** - Validates query/path parameters
   - Used for: `GET /chat/history`, `DELETE /documents/{documentId}`
   
3. **All Validator** - Validates both body and parameters
   - Available for endpoints that need both validations

Request models enforce:
- Required fields
- Data types
- Value constraints (e.g., max file size 100MB)
- Enum values (e.g., contentType must be "application/pdf")

## AWS WAF Configuration

AWS WAF provides multiple layers of protection:

### Rate-Based Protection
- Default: 2000 requests per 5 minutes per IP address
- Configurable via `waf_rate_limit` variable
- Blocks IPs that exceed the threshold
- Automatic unblocking after 5 minutes

### AWS Managed Rule Sets
1. **Common Rule Set** - Protects against common web exploits
   - OWASP Top 10 vulnerabilities
   - Some rules set to COUNT mode to avoid false positives
   
2. **Known Bad Inputs** - Blocks requests with known malicious patterns
   - Malformed requests
   - Known attack signatures
   
3. **SQL Injection Protection** - Prevents SQL injection attacks
   - Detects SQL injection patterns in requests
   - Blocks malicious SQL queries

### IP Filtering
- **Blocklist**: Block specific IP addresses or CIDR ranges
- **Allowlist**: Allow only specific IP addresses (optional)

Example configuration:
```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  enable_waf       = true
  waf_rate_limit   = 2000
  waf_ip_blocklist = ["192.0.2.0/24", "198.51.100.44/32"]
  waf_ip_allowlist = [] # Empty = allow all (except blocklist)
}
```

### WAF Monitoring
- CloudWatch metrics for each rule
- Sampled requests for analysis
- Logs stored in CloudWatch Logs with 365-day retention
- Sensitive headers (Authorization, Cookie) are redacted from logs

### Disabling WAF
To disable WAF (not recommended for production):
```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  enable_waf = false
}
```

## Extending the API

To add new endpoints, you can use the module outputs and existing validators:

```hcl
# Add a new resource
resource "aws_api_gateway_resource" "new_endpoint" {
  rest_api_id = module.rest_api.rest_api_id
  parent_id   = module.rest_api.rest_api_root_resource_id
  path_part   = "new-endpoint"
}

# Add a method with authorization and validation
resource "aws_api_gateway_method" "new_endpoint_post" {
  rest_api_id          = module.rest_api.rest_api_id
  resource_id          = aws_api_gateway_resource.new_endpoint.id
  http_method          = "POST"
  authorization        = "CUSTOM"
  authorizer_id        = module.rest_api.authorizer_id
  request_validator_id = module.rest_api.body_validator_id
}
```

## Monitoring

CloudWatch logs are available at:
- `/aws/apigateway/{environment}-chatbot-api` - API Gateway access logs
- `/aws/wafv2/{environment}-chatbot-api` - WAF logs

Metrics available:
- Request count
- Latency (p50, p95, p99)
- 4XX/5XX errors
- Cache hit/miss (authorizer)
- WAF rule matches and blocks
- Rate limit violations

## Security

1. **Authentication:** Lambda Authorizer validates all protected endpoints
2. **Encryption:** HTTPS/TLS 1.2+ for all traffic
3. **Throttling:** Rate limiting to prevent abuse (API Gateway level)
4. **WAF Protection:** 
   - Rate-based blocking (2000 req/5min per IP)
   - AWS Managed Rules for common vulnerabilities
   - SQL injection protection
   - IP blocklist/allowlist support
5. **Logging:** Comprehensive audit trail in CloudWatch
6. **IAM:** Least privilege roles for all components
7. **Request Validation:** JSON schema validation for all requests
8. **Header Redaction:** Sensitive headers removed from WAF logs

## Cost Optimization

- **Authorizer Caching:** 5-minute TTL reduces Lambda invocations
- **Regional Endpoint:** Lower latency and cost vs edge-optimized
- **Throttling:** Prevents runaway costs from abuse

## Troubleshooting

### 400 Bad Request

- Request body or parameters failed validation
- Check the error message for specific validation failures
- Verify request matches the expected model schema

### 401 Unauthorized

- Verify the JWT token is valid and not expired
- Check that the token is in the Authorization header: `Bearer <token>`
- Check CloudWatch logs for the authorizer function

### 403 Forbidden

- The authorizer denied access (invalid token or session)
- Check the authorizer Lambda logs for details

### 429 Too Many Requests

- Rate limit exceeded (50 req/sec or 100 burst at API Gateway level)
- OR WAF rate limit exceeded (2000 req/5min per IP)
- Wait and retry with exponential backoff
- Check CloudWatch WAF logs if blocked by WAF

### 403 Forbidden (WAF Block)

- Request blocked by WAF rule
- Could be rate limit, malicious pattern, or IP blocklist
- Check CloudWatch WAF logs: `/aws/wafv2/{environment}-chatbot-api`
- Review sampled requests in WAF console
- Adjust WAF rules if legitimate traffic is blocked

### 500 Internal Server Error

- Check CloudWatch logs for the Lambda function
- Verify Lambda has correct IAM permissions
- Check DynamoDB table accessibility

## Dependencies

This module depends on:
- `auth` module (Lambda Authorizer and auth functions)
- `database` module (Sessions table)

## Next Steps

After deploying this module, you can:
1. Test all endpoints with Postman or curl
2. Configure custom domain with ACM certificate
3. Add AWS WAF for additional security
4. Set up CloudWatch alarms for monitoring
5. Implement additional endpoints as needed
6. Add response caching for GET endpoints
7. Configure API keys for additional access control
