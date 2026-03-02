# Chat History Lambda Module

This Terraform module deploys the Chat History Lambda function that retrieves conversation history for user sessions.

## Overview

The Chat History Lambda function implements the `GET /chat/history` endpoint that:
- Retrieves conversation history from DynamoDB ChatHistory table
- Decrypts message content using KMS
- Supports pagination with limit and nextToken parameters
- Returns messages in reverse chronological order (most recent first)

**Validates Requirements: 8.3**

## Resources Created

- **Lambda Function**: Chat History endpoint handler
- **IAM Role**: Execution role for the Lambda function
- **IAM Policy**: Permissions for DynamoDB Query, KMS Decrypt, and CloudWatch Logs
- **CloudWatch Log Group**: Log storage with 365-day retention

## Prerequisites

Before deploying this module, ensure:

1. **Lambda Code Built**: Run the build script in `lambda/chat/history/`
   ```bash
   cd lambda/chat/history
   npm run build
   # or
   ./build-for-terraform.sh  # Linux/Mac
   ./build-for-terraform.ps1 # Windows
   ```

2. **DynamoDB Table**: ChatHistory table must exist with composite key (PK=userId#sessionId, SK=timestamp)

3. **KMS Key**: KMS key must exist for message encryption/decryption

## Usage

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

## Inputs

| Name | Description | Type | Required | Default |
|------|-------------|------|----------|---------|
| environment | Environment name (e.g., dev, staging, prod) | string | Yes | - |
| chat_history_table_name | Name of the DynamoDB ChatHistory table | string | Yes | - |
| chat_history_table_arn | ARN of the DynamoDB ChatHistory table | string | Yes | - |
| kms_key_arn | ARN of the KMS key for message encryption/decryption | string | Yes | - |
| kms_key_id | ID of the KMS key for message encryption/decryption | string | Yes | - |
| aws_region | AWS region | string | No | us-east-1 |

## Outputs

| Name | Description |
|------|-------------|
| lambda_function_arn | ARN of the Chat History Lambda function |
| lambda_function_name | Name of the Chat History Lambda function |
| lambda_invoke_arn | Invoke ARN for API Gateway integration |
| lambda_role_arn | ARN of the IAM role |
| lambda_role_name | Name of the IAM role |
| log_group_name | Name of the CloudWatch Log Group |
| log_group_arn | ARN of the CloudWatch Log Group |

## API Gateway Integration

To integrate with API Gateway, add to the `rest-api` module:

```hcl
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
```

## Lambda Configuration

- **Runtime**: Node.js 20.x
- **Memory**: 512 MB
- **Timeout**: 30 seconds
- **Handler**: index.handler

## Environment Variables

The Lambda function uses the following environment variables:

- `CHAT_HISTORY_TABLE_NAME`: DynamoDB table name
- `KMS_KEY_ID`: KMS key ID for decryption
- `AWS_REGION`: AWS region
- `LOG_LEVEL`: Logging level (INFO)

## IAM Permissions

The Lambda function has permissions for:

1. **CloudWatch Logs**: Create log groups, streams, and put log events
2. **DynamoDB**: Query and GetItem on ChatHistory table and indexes
3. **KMS**: Decrypt message content

## Performance

- **Target Response Time**: < 500ms (Requirement 8.3)
- **Cold Start**: ~1-2 seconds
- **Warm Execution**: < 500ms

## Monitoring

CloudWatch metrics to monitor:

- **Duration**: Should be < 500ms
- **Errors**: Should be < 1%
- **Throttles**: Should be 0
- **Concurrent Executions**: Monitor for scaling

## Security

- Messages are encrypted at rest using KMS
- Authentication required via API Gateway authorizer
- Users can only access their own conversation history
- CORS enabled for browser access
- Least privilege IAM permissions

## Cost Optimization

- 512 MB memory allocation balances performance and cost
- 30-second timeout prevents runaway executions
- CloudWatch Logs retention set to 365 days for compliance

## Troubleshooting

### Lambda fails with "KMS Decrypt error"
- Verify KMS key permissions include Lambda execution role
- Check KMS key ID is correct in environment variables

### Lambda returns empty messages array
- Verify ChatHistory table has data for the user/session
- Check DynamoDB table key schema matches expected format (PK=userId#sessionId, SK=timestamp)

### Lambda times out
- Check DynamoDB table has appropriate read capacity
- Verify network connectivity if in VPC
- Review CloudWatch Logs for slow queries

## Related Modules

- `database`: Provides ChatHistory table
- `security`: Provides KMS key
- `rest-api`: Provides API Gateway integration
- `auth`: Provides Lambda Authorizer

## Related Tasks

- Task 15.1: Chat history persistence module
- Task 15.2: Chat history retrieval module
- Task 15.3: Chat history endpoint Lambda (this module)
