# Chat History Lambda Deployment Guide

## Overview

This guide explains how to deploy the Chat History Lambda function using Terraform.

## Prerequisites

### 1. Build the Lambda Function

Before running Terraform, build the Lambda deployment package:

```bash
cd lambda/chat/history
npm run build
```

This creates `dist/lambda-chat-history.zip` (not used directly by Terraform, but validates the build works).

Terraform will automatically package the `dist/` directory contents.

### 2. Verify Build Output

Ensure the following structure exists:

```
lambda/chat/history/dist/
├── index.mjs                    # Main handler
├── node_modules/                # AWS SDK dependencies
└── shared/                      # Bundled shared modules
    └── chat-history/
        ├── chat-history.mjs
        ├── types.mjs
        └── encryption.mjs
```

### 3. Required AWS Resources

The following resources must exist before deploying:

- **DynamoDB Table**: ChatHistory table with composite key
  - PK: `userId#sessionId` (String)
  - SK: `timestamp` (Number)
  - TTL attribute: `ttl`
  
- **KMS Key**: For message encryption/decryption

- **API Gateway**: REST API for endpoint integration

## Deployment Steps

### Step 1: Add Module to Main Terraform Configuration

In your root `main.tf`, add the chat-history module:

```hcl
module "chat_history" {
  source = "./modules/chat-history"

  environment             = var.environment
  chat_history_table_name = module.database.chat_history_table_name
  chat_history_table_arn  = module.database.chat_history_table_arn
  kms_key_arn             = module.security.kms_key_arn
  kms_key_id              = module.security.kms_key_id
  aws_region              = var.aws_region
}
```

### Step 2: Update REST API Module

Add the chat history endpoint to `modules/rest-api/main.tf`:

```hcl
# Add to variables.tf
variable "chat_history_function_name" {
  description = "Name of the Chat History Lambda function"
  type        = string
}

variable "chat_history_invoke_arn" {
  description = "Invoke ARN of the Chat History Lambda function"
  type        = string
}

# Add to main.tf
# /chat Resource
resource "aws_api_gateway_resource" "chat" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_rest_api.chatbot.root_resource_id
  path_part   = "chat"
}

# /chat/history Resource
resource "aws_api_gateway_resource" "chat_history" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.chat.id
  path_part   = "history"
}

# GET /chat/history Method
resource "aws_api_gateway_method" "chat_history" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.chat_history.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda.id
}

# GET /chat/history Integration
resource "aws_api_gateway_integration" "chat_history" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.chat_history.id
  http_method             = aws_api_gateway_method.chat_history.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.chat_history_invoke_arn
}

# Lambda Permission
resource "aws_lambda_permission" "chat_history" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.chat_history_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# CORS Configuration
resource "aws_api_gateway_method" "chat_history_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.chat_history.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  status_code = aws_api_gateway_method_response.chat_history_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Update deployment dependencies
resource "aws_api_gateway_deployment" "chatbot" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id

  depends_on = [
    # ... existing dependencies ...
    aws_api_gateway_integration.chat_history,
    aws_api_gateway_integration.chat_history_options,
  ]

  lifecycle {
    create_before_destroy = true
  }
}
```

### Step 3: Pass Module Outputs to REST API

In your root `main.tf`, pass the chat history outputs to the REST API module:

```hcl
module "rest_api" {
  source = "./modules/rest-api"

  # ... existing variables ...

  # Chat History Lambda
  chat_history_function_name = module.chat_history.lambda_function_name
  chat_history_invoke_arn    = module.chat_history.lambda_invoke_arn
}
```

### Step 4: Run Terraform

```bash
cd terraform

# Initialize Terraform (if not already done)
terraform init

# Plan the deployment
terraform plan

# Apply the changes
terraform apply
```

## Verification

### 1. Check Lambda Function

```bash
aws lambda get-function --function-name <environment>-chatbot-chat-history
```

### 2. Check API Gateway Endpoint

```bash
aws apigateway get-resources --rest-api-id <api-id>
```

Look for `/chat/history` resource.

### 3. Test the Endpoint

```bash
# Get an auth token first
TOKEN=$(curl -X POST https://<api-url>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' | jq -r '.token')

# Test chat history endpoint
curl -X GET "https://<api-url>/chat/history?sessionId=test-session&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:
```json
{
  "messages": [],
  "nextToken": null
}
```

## Monitoring

### CloudWatch Logs

View Lambda logs:
```bash
aws logs tail /aws/lambda/<environment>-chatbot-chat-history --follow
```

### CloudWatch Metrics

Monitor key metrics:
- **Duration**: Should be < 500ms
- **Errors**: Should be minimal
- **Invocations**: Track usage patterns

### CloudWatch Alarms

Create alarms for:
```hcl
resource "aws_cloudwatch_metric_alarm" "chat_history_duration" {
  alarm_name          = "${var.environment}-chat-history-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "60"
  statistic           = "Average"
  threshold           = "500"
  alarm_description   = "Chat history response time exceeds 500ms"
  
  dimensions = {
    FunctionName = module.chat_history.lambda_function_name
  }
}
```

## Troubleshooting

### Issue: Terraform can't find dist directory

**Solution**: Build the Lambda function first:
```bash
cd lambda/chat/history
npm run build
```

### Issue: Lambda fails with "Cannot find module"

**Solution**: Verify the build includes shared modules:
```bash
ls -la lambda/chat/history/dist/shared/chat-history/
```

Should show `chat-history.mjs`, `types.mjs`, `encryption.mjs`.

### Issue: API Gateway returns 500 error

**Solution**: Check Lambda logs:
```bash
aws logs tail /aws/lambda/<environment>-chatbot-chat-history --follow
```

Common issues:
- Missing environment variables
- Incorrect KMS key permissions
- DynamoDB table not found

### Issue: Lambda times out

**Solution**: 
1. Check DynamoDB table has appropriate capacity
2. Verify KMS key is accessible
3. Increase Lambda timeout if needed (currently 30s)

## Rollback

To rollback the deployment:

```bash
# Destroy the chat history module
terraform destroy -target=module.chat_history

# Or rollback to previous state
terraform apply -var-file=previous.tfvars
```

## Cost Estimation

Estimated monthly costs (moderate usage):

- **Lambda Invocations**: 100,000 requests/month
  - Compute: ~$0.20
  - Requests: ~$0.02
  
- **CloudWatch Logs**: 1 GB/month
  - Storage: ~$0.50
  - Ingestion: ~$0.50

- **DynamoDB Reads**: Included in table costs

**Total**: ~$1.22/month

## Security Considerations

1. **IAM Permissions**: Lambda has least privilege access
2. **Encryption**: Messages encrypted at rest with KMS
3. **Authentication**: API Gateway authorizer required
4. **CORS**: Configured for browser access
5. **Logging**: All requests logged to CloudWatch

## Next Steps

After deployment:

1. **Integration Testing**: Test with real chat history data
2. **Load Testing**: Verify performance under load
3. **Monitoring Setup**: Configure CloudWatch alarms
4. **Documentation**: Update API documentation with endpoint details
5. **Frontend Integration**: Connect React app to the endpoint
