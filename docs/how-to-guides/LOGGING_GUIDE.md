# CloudWatch Logging Guide

## Where to Find Your Lambda Logs

Your Lambda functions are logging correctly, but the log groups have different names than expected. Here's where to find each function's logs:

### Authentication & Authorization
```
/aws/lambda/${environment}-api-authorizer      # Lambda authorizer for API Gateway
/aws/lambda/${environment}-auth-login          # Login endpoint
/aws/lambda/${environment}-auth-logout         # Logout endpoint
```

### WebSocket (Real-time Chat)
```
/aws/lambda/${environment}-websocket-connect    # WebSocket connection handler
/aws/lambda/${environment}-websocket-disconnect # WebSocket disconnection handler
/aws/lambda/${environment}-websocket-message    # Main chat message handler (THIS IS YOUR CHAT HANDLER)
```

### Document Management
```
/aws/lambda/${environment}-document-upload      # Document upload presigned URL generator
/aws/lambda/${environment}-document-list        # List user documents
/aws/lambda/${environment}-document-delete      # Delete documents
```

### Document Processing
```
/aws/lambda/${environment}-chatbot-document-processor    # PDF text extraction
/aws/lambda/${environment}-chatbot-generate-embeddings   # Embedding generation
```

### Chat History
```
/aws/lambda/${environment}-chatbot-chat-history  # Chat history retrieval
```

### API Gateway
```
/aws/apigateway/${environment}-chatbot-api      # REST API Gateway access logs
/aws/apigateway/${environment}-websocket        # WebSocket API Gateway access logs
```

### Audit Logs
```
/aws/lambda/chatbot/audit/user-actions          # User action audit trail
/aws/lambda/chatbot/audit/api-calls             # API call audit trail
/aws/lambda/chatbot/audit/document-operations   # Document operation audit trail
```

## Quick Access Commands

### View recent logs for chat handler
```bash
aws logs tail /aws/lambda/${environment}-websocket-message --follow
```

### View recent logs for auth
```bash
aws logs tail /aws/lambda/${environment}-auth-login --follow
```

### View all Lambda log groups
```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/${environment}-"
```

### Search for errors across all Lambda functions
```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/${environment}-websocket-message" \
  --filter-pattern "ERROR"
```

## Troubleshooting

### If you don't see logs:

1. **Check the Lambda function is being invoked**
   ```bash
   aws lambda get-function --function-name ${environment}-websocket-message
   ```

2. **Verify IAM permissions**
   Each Lambda function has CloudWatch Logs permissions in its IAM role:
   - `logs:CreateLogGroup`
   - `logs:CreateLogStream`
   - `logs:PutLogEvents`

3. **Check if log group exists**
   ```bash
   aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/${environment}-"
   ```

4. **Verify Lambda is actually executing**
   Check CloudWatch Metrics for Lambda invocations:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Invocations \
     --dimensions Name=FunctionName,Value=${environment}-websocket-message \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Sum
   ```

## What Changed

Previously, the monitoring module created generic log groups that were never used:
- `/aws/lambda/${environment}-chatbot-auth` ❌ (not used)
- `/aws/lambda/${environment}-chatbot-chat` ❌ (not used)
- `/aws/lambda/${environment}-chatbot-websocket` ❌ (not used)
- `/aws/chatbot/${environment}/application` ❌ (not used)
- `/aws/apigateway/${environment}-chatbot` ❌ (not used - rest-api creates its own)

These were orphaned because each module creates its own log group with the actual resource name. The fix removes these unused log groups, updates the alarm to monitor the correct function, and configures WebSocket API Gateway to actually use its log group.

## Next Steps

After applying the Terraform changes:
1. Run `terraform apply` to remove orphaned log groups
2. Check the correct log groups listed above
3. Your logs should be there!
