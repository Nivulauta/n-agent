# Authentication Service Deployment Guide

This guide walks through deploying the Authentication Service Lambda functions.

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** installed (version >= 1.0)
3. **Node.js** 20.x or later
4. **npm** or **yarn**
5. **DynamoDB tables** created (Sessions, Users)

## Step 1: Build Lambda Functions

Build all authentication Lambda functions:

```bash
cd lambda
chmod +x build.sh
./build.sh
```

This will:
- Install dependencies for each function
- Compile TypeScript to JavaScript
- Create deployment packages (`.zip` files)

## Step 2: Configure JWT Secret

The JWT secret should be stored securely. You have two options:

### Option A: AWS Secrets Manager (Recommended)

1. Create a secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name /chatbot/jwt-secret \
  --secret-string "your-secure-random-secret-key-here"
```

2. Update Terraform to retrieve the secret:

```terraform
data "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id = "/chatbot/jwt-secret"
}

locals {
  jwt_secret = data.aws_secretsmanager_secret_version.jwt_secret.secret_string
}
```

### Option B: Terraform Variable (Development Only)

For development environments, you can use a Terraform variable:

```bash
export TF_VAR_jwt_secret="your-secret-key"
```

**⚠️ Warning**: Never commit secrets to version control!

## Step 3: Deploy with Terraform

1. Navigate to the Terraform directory:

```bash
cd terraform
```

2. Initialize Terraform (if not already done):

```bash
terraform init
```

3. Add the auth module to your main Terraform configuration:

```terraform
module "auth" {
  source = "./modules/auth"

  environment         = var.environment
  sessions_table_name = module.database.sessions_table_name
  sessions_table_arn  = module.database.sessions_table_arn
  users_table_name    = module.database.users_table_name
  users_table_arn     = module.database.users_table_arn
  jwt_secret          = var.jwt_secret
}
```

4. Plan the deployment:

```bash
terraform plan
```

5. Apply the changes:

```bash
terraform apply
```

## Step 4: Create Test User

After deployment, create a test user:

```bash
cd lambda/auth/scripts
npm install
node create-test-user.js dev testuser mypassword123
```

Replace:
- `dev` with your environment name
- `testuser` with desired username
- `mypassword123` with desired password

## Step 5: Test the Authentication Flow

### Test Login

```bash
# Get the API Gateway URL from Terraform outputs
API_URL=$(terraform output -raw rest_api_url)

# Test login
curl -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "christopher",
    "password": "cherasco"
  }'
```

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1234567890000,
  "userId": "uuid-here"
}
```

### Test Authenticated Request

```bash
# Save the token from login response
TOKEN="your-token-here"

# Test an authenticated endpoint
curl -X GET "${API_URL}/some-protected-endpoint" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Test Logout

```bash
curl -X POST "${API_URL}/auth/logout" \
  -H "Authorization: Bearer ${TOKEN}"
```

Expected response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Step 6: Configure API Gateway

The Lambda Authorizer needs to be attached to API Gateway routes. Add this to your API Gateway Terraform configuration:

```terraform
resource "aws_apigatewayv2_authorizer" "lambda_authorizer" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = module.auth.authorizer_invoke_arn
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.environment}-lambda-authorizer"
  
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = false
}

# Grant API Gateway permission to invoke the authorizer
resource "aws_lambda_permission" "authorizer_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.auth.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
```

## Monitoring

After deployment, monitor the Lambda functions:

### CloudWatch Logs

```bash
# View authorizer logs
aws logs tail /aws/lambda/dev-api-authorizer --follow

# View login logs
aws logs tail /aws/lambda/dev-auth-login --follow

# View logout logs
aws logs tail /aws/lambda/dev-auth-logout --follow
```

### CloudWatch Metrics

Monitor these metrics in CloudWatch:
- **Invocations**: Number of function invocations
- **Duration**: Execution time (should be < 500ms for login)
- **Errors**: Failed invocations
- **Throttles**: Rate-limited invocations

## Troubleshooting

### Issue: "Invalid credentials" error

**Cause**: User doesn't exist or password is incorrect

**Solution**: 
1. Verify user exists in DynamoDB Users table
2. Check password hash is correct
3. Ensure bcrypt is working properly

### Issue: "Token expired" error

**Cause**: JWT token has expired (24 hours)

**Solution**: Log in again to get a new token

### Issue: "Session not found" error

**Cause**: Session was deleted or expired in DynamoDB

**Solution**: 
1. Check DynamoDB Sessions table
2. Verify TTL is configured correctly
3. Log in again to create a new session

### Issue: Lambda function timeout

**Cause**: DynamoDB query is slow or network issues

**Solution**:
1. Check DynamoDB metrics
2. Verify VPC configuration if Lambda is in VPC
3. Increase Lambda timeout if needed

### Issue: "Access Denied" from DynamoDB

**Cause**: Lambda IAM role lacks permissions

**Solution**:
1. Verify IAM role has correct permissions
2. Check resource ARNs in IAM policy
3. Review CloudWatch Logs for detailed error

## Security Best Practices

1. **Rotate JWT Secret**: Rotate the JWT secret regularly (every 90 days)
2. **Use Secrets Manager**: Store secrets in AWS Secrets Manager, not environment variables
3. **Enable CloudTrail**: Monitor API calls to Lambda and DynamoDB
4. **Set Up Alarms**: Create CloudWatch alarms for error rates and latency
5. **Review IAM Policies**: Regularly audit IAM roles for least privilege
6. **Enable MFA**: Require MFA for administrative operations
7. **Use VPC**: Deploy Lambda functions in VPC for additional network isolation

## Updating Lambda Functions

To update Lambda functions after code changes:

1. Rebuild the functions:
```bash
cd lambda
./build.sh
```

2. Apply Terraform changes:
```bash
cd terraform
terraform apply
```

Terraform will detect the new deployment packages and update the Lambda functions.

## Rollback

If you need to rollback a deployment:

1. Revert code changes in Git
2. Rebuild Lambda functions
3. Apply Terraform with the previous version

Alternatively, use Lambda versioning and aliases for blue-green deployments.


## REST API Gateway Integration

The Lambda Authorizer is now fully integrated with the REST API Gateway through the `rest-api` Terraform module.

### What's Included

The `rest-api` module (located at `terraform/modules/rest-api/`) automatically creates:

1. **REST API Gateway** with regional endpoint
2. **Lambda Authorizer** for token-based authentication
3. **Authentication Endpoints**:
   - `POST /auth/login` - User login (no auth required)
   - `POST /auth/logout` - User logout (requires auth)
4. **CORS Configuration** for browser access
5. **CloudWatch Logging** with 365-day retention
6. **Throttling** (burst=100, rate=50 req/sec)

### Module Configuration

The module is already configured in `terraform/main.tf`:

```terraform
module "rest_api" {
  source = "./modules/rest-api"

  environment              = var.environment
  authorizer_function_arn  = module.auth.authorizer_function_arn
  authorizer_invoke_arn    = module.auth.authorizer_invoke_arn
  login_function_name      = module.auth.login_function_name
  login_invoke_arn         = module.auth.login_invoke_arn
  logout_function_name     = module.auth.logout_function_name
  logout_invoke_arn        = module.auth.logout_invoke_arn
}
```

### Testing the REST API

After deploying with Terraform, test the endpoints:

```bash
# Get the REST API URL
REST_API_URL=$(terraform output -raw rest_api_url)

# Test login
curl -X POST "${REST_API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "christopher",
    "password": "cherasco"
  }'

# Save the token from the response
TOKEN="<token-from-response>"

# Test logout
curl -X POST "${REST_API_URL}/auth/logout" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Adding Protected Endpoints

To add more protected endpoints to the REST API, use the module outputs:

```terraform
# Example: Add a protected /documents endpoint
resource "aws_api_gateway_resource" "documents" {
  rest_api_id = module.rest_api.rest_api_id
  parent_id   = module.rest_api.rest_api_root_resource_id
  path_part   = "documents"
}

resource "aws_api_gateway_method" "documents_get" {
  rest_api_id   = module.rest_api.rest_api_id
  resource_id   = aws_api_gateway_resource.documents.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = module.rest_api.authorizer_id
}

resource "aws_api_gateway_integration" "documents_get" {
  rest_api_id             = module.rest_api.rest_api_id
  resource_id             = aws_api_gateway_resource.documents.id
  http_method             = aws_api_gateway_method.documents_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.documents_handler.invoke_arn
}
```

### Module Outputs

The REST API module provides these outputs:

- `rest_api_id` - API Gateway REST API ID
- `rest_api_execution_arn` - Execution ARN for permissions
- `rest_api_root_resource_id` - Root resource ID for adding endpoints
- `stage_url` - Full URL of the API (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/dev`)
- `stage_name` - Stage name (matches environment)
- `authorizer_id` - Lambda Authorizer ID for protected endpoints

### Authentication Flow

1. **Client** sends POST request to `/auth/login` with credentials
2. **Login Lambda** validates credentials and creates session
3. **Client** receives JWT token
4. **Client** includes token in `Authorization: Bearer <token>` header for protected endpoints
5. **API Gateway** invokes Lambda Authorizer to validate token
6. **Lambda Authorizer** checks JWT signature and session in DynamoDB
7. **API Gateway** allows or denies request based on authorizer response
8. **Protected Lambda** processes the request

### CORS Support

CORS is pre-configured for browser access:

- **Allowed Origins**: `*` (wildcard)
- **Allowed Methods**: `POST, OPTIONS`
- **Allowed Headers**: `Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token`

For production, update the CORS configuration to restrict origins:

```terraform
# In terraform/modules/rest-api/main.tf, update the CORS response parameters
response_parameters = {
  "method.response.header.Access-Control-Allow-Origin" = "'https://yourdomain.com'"
}
```

### Monitoring REST API

Monitor the REST API through CloudWatch:

```bash
# View API Gateway logs
aws logs tail /aws/apigateway/dev-chatbot-api --follow

# View API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=dev-chatbot-api \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

Key metrics to monitor:
- **Count** - Total number of API requests
- **4XXError** - Client errors (auth failures, bad requests)
- **5XXError** - Server errors (Lambda failures)
- **Latency** - Request latency (p50, p95, p99)
- **IntegrationLatency** - Lambda execution time

### Cost Optimization

The REST API module includes cost optimization features:

1. **Authorizer Caching** - 5-minute TTL reduces Lambda invocations by ~90%
2. **Regional Endpoint** - Lower cost than edge-optimized endpoints
3. **Throttling** - Prevents runaway costs from abuse or attacks
4. **On-Demand Pricing** - No upfront costs, pay per request

Estimated costs for moderate usage (10,000 requests/day):
- API Gateway: ~$0.35/month
- Lambda (Authorizer): ~$0.10/month
- Lambda (Login/Logout): ~$0.05/month
- **Total**: ~$0.50/month

### Next Steps

1. Deploy the infrastructure: `terraform apply`
2. Create test users with the script
3. Test the authentication flow
4. Add document management endpoints (Task 12)
5. Add chat history endpoints (Task 15)
6. Configure custom domain with ACM certificate
7. Add AWS WAF for additional security
