# Chat History Lambda Deployment Guide

This guide covers deploying the chat history endpoint Lambda function.

## Prerequisites

- Node.js 22.x or later
- npm
- AWS CLI configured with appropriate credentials
- Terraform (if using infrastructure as code)

## Environment Variables

The Lambda function requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| CHAT_HISTORY_TABLE_NAME | DynamoDB table name for chat history | `ChatHistory` |
| KMS_KEY_ID | KMS key ID for message decryption | `arn:aws:kms:us-east-1:123456789012:key/...` |
| AWS_REGION | AWS region | `us-east-1` |

## Building the Deployment Package

### Option 1: Using PowerShell (Windows)

```powershell
.\build-for-terraform.ps1
```

### Option 2: Using Bash (Linux/Mac)

```bash
chmod +x build-for-terraform.sh
./build-for-terraform.sh
```

### Option 3: Manual Build

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# The output will be in dist/index.mjs
```

## Deployment with Terraform

### Lambda Function Configuration

```hcl
resource "aws_lambda_function" "chat_history" {
  filename         = "${path.module}/lambda/chat/history/dist/lambda-chat-history.zip"
  function_name    = "chat-history-endpoint"
  role            = aws_iam_role.chat_history_lambda.arn
  handler         = "index.handler"
  runtime         = "nodejs22.x"
  timeout         = 30
  memory_size     = 512

  environment {
    variables = {
      CHAT_HISTORY_TABLE_NAME = aws_dynamodb_table.chat_history.name
      KMS_KEY_ID             = aws_kms_key.chat_history.id
      AWS_REGION             = var.aws_region
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
}
```

### IAM Role

```hcl
resource "aws_iam_role" "chat_history_lambda" {
  name = "chat-history-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "chat_history_lambda_policy" {
  name = "chat-history-lambda-policy"
  role = aws_iam_role.chat_history_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.chat_history.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [
          aws_kms_key.chat_history.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}
```

### API Gateway Integration

```hcl
resource "aws_api_gateway_resource" "chat" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "chat"
}

resource "aws_api_gateway_resource" "history" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.chat.id
  path_part   = "history"
}

resource "aws_api_gateway_method" "get_history" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.history.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda.id
}

resource "aws_api_gateway_integration" "get_history" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.history.id
  http_method             = aws_api_gateway_method.get_history.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_history.invoke_arn
}

resource "aws_lambda_permission" "api_gateway_chat_history" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat_history.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
```

## Manual Deployment with AWS CLI

```bash
# Create the Lambda function
aws lambda create-function \
  --function-name chat-history-endpoint \
  --runtime nodejs22.x \
  --role arn:aws:iam::ACCOUNT_ID:role/chat-history-lambda-role \
  --handler index.handler \
  --zip-file fileb://dist/lambda-chat-history.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{CHAT_HISTORY_TABLE_NAME=ChatHistory,KMS_KEY_ID=arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID,AWS_REGION=us-east-1}"

# Update existing function
aws lambda update-function-code \
  --function-name chat-history-endpoint \
  --zip-file fileb://dist/lambda-chat-history.zip
```

## Testing

### Test Event

Create a test event in the Lambda console:

```json
{
  "httpMethod": "GET",
  "queryStringParameters": {
    "sessionId": "test-session-123",
    "limit": "10"
  },
  "requestContext": {
    "authorizer": {
      "userId": "test-user-123"
    },
    "awsRequestId": "test-request-id"
  }
}
```

### Expected Response

```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true
  },
  "body": "{\"messages\":[],\"nextToken\":null}"
}
```

### Testing with curl

```bash
curl -X GET "https://your-api-gateway-url/chat/history?sessionId=abc123&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Monitoring

### CloudWatch Logs

The Lambda function logs to CloudWatch Logs. Log group name:
```
/aws/lambda/chat-history-endpoint
```

### Key Metrics

Monitor these CloudWatch metrics:
- `Duration` - Execution time (should be < 500ms per Requirement 8.3)
- `Errors` - Error count
- `Throttles` - Throttling events
- `ConcurrentExecutions` - Number of concurrent executions

### CloudWatch Alarms

Create alarms for:
- Duration > 500ms (Requirement 8.3)
- Error rate > 1%
- Throttles > 0

## Troubleshooting

### Common Issues

1. **"Unauthorized" error**
   - Check that the API Gateway authorizer is configured correctly
   - Verify the userId is being passed in the authorizer context

2. **"Missing required parameter: sessionId" error**
   - Ensure the sessionId query parameter is included in the request

3. **"Encryption service error"**
   - Verify the KMS_KEY_ID environment variable is set correctly
   - Check that the Lambda execution role has `kms:Decrypt` permission
   - Ensure the KMS key exists and is enabled

4. **Slow response times**
   - Check DynamoDB table performance metrics
   - Verify the Lambda function has adequate memory (512MB recommended)
   - Check for cold start issues (consider provisioned concurrency)

5. **Empty messages array**
   - Verify the sessionId exists in the ChatHistory table
   - Check that the userId matches the session owner
   - Ensure messages haven't expired (90-day TTL)

## Performance Optimization

1. **Memory Allocation**: 512MB is recommended for optimal performance
2. **Timeout**: 30 seconds allows for decryption of large message sets
3. **Provisioned Concurrency**: Consider for latency-sensitive applications
4. **VPC Configuration**: If using VPC, ensure NAT Gateway is properly configured

## Security Considerations

- All message content is encrypted at rest using KMS
- Authentication is required via API Gateway authorizer
- Users can only access their own conversation history
- CORS is enabled for browser access
- Follow least privilege principle for IAM roles

## Cost Estimation

Assuming:
- 1000 requests per day
- Average execution time: 300ms
- Memory: 512MB

Monthly cost: ~$0.20 (Lambda) + DynamoDB costs + KMS costs

## Next Steps

After deployment:
1. Test the endpoint with various query parameters
2. Monitor CloudWatch metrics and logs
3. Set up CloudWatch alarms for performance and errors
4. Integrate with the frontend chat interface
5. Load test to verify performance under concurrent load
