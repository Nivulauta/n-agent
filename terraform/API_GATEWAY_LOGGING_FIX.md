# API Gateway Logging Fix

## Issue Found
The monitoring module was creating an API Gateway log group that was never used, and the WebSocket API Gateway was not configured to send access logs.

## Problems Identified

### 1. Duplicate/Orphaned API Gateway Log Group
**Monitoring module created**: `/aws/apigateway/${environment}-chatbot`
**Actually used**: `/aws/apigateway/${environment}-chatbot-api` (created by rest-api module)

The rest-api module creates its own log group and configures the API Gateway stage to use it. The monitoring module's log group was orphaned and never received any logs.

### 2. WebSocket API Gateway Not Logging
The websocket module created a log group `/aws/apigateway/${environment}-websocket` but the WebSocket stage was **not configured** to send access logs to it.

## Fixes Applied

### 1. Removed Orphaned API Gateway Log Group
```terraform
# REMOVED from terraform/modules/monitoring/main.tf
resource "aws_cloudwatch_log_group" "api_gateway" {
  name = "/aws/apigateway/${var.environment}-chatbot"
}
```

### 2. Configured WebSocket API Gateway Logging
Added access log settings to the WebSocket stage:

```terraform
# ADDED to terraform/modules/websocket/main.tf
resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.websocket_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }
  
  # ... rest of configuration
}
```

## Correct API Gateway Log Groups

After these fixes, the correct log groups are:

### REST API Gateway
- **Log Group**: `/aws/apigateway/${environment}-chatbot-api`
- **Created by**: `terraform/modules/rest-api/main.tf`
- **Configured in**: REST API stage access_log_settings
- **Logs**: All REST API requests (login, logout, document upload/list/delete, chat history)

### WebSocket API Gateway
- **Log Group**: `/aws/apigateway/${environment}-websocket`
- **Created by**: `terraform/modules/websocket/main.tf`
- **Configured in**: WebSocket stage access_log_settings (NOW FIXED)
- **Logs**: All WebSocket connections, disconnections, and messages

## What Gets Logged

### REST API Access Logs
```json
{
  "requestId": "abc-123",
  "ip": "1.2.3.4",
  "requestTime": "01/Jan/2024:12:00:00 +0000",
  "httpMethod": "POST",
  "resourcePath": "/auth/login",
  "status": "200",
  "protocol": "HTTP/1.1",
  "responseLength": "256",
  "userId": "user-123",
  "action": "login"
}
```

### WebSocket Access Logs (NOW ENABLED)
```json
{
  "requestId": "def-456",
  "ip": "1.2.3.4",
  "requestTime": "01/Jan/2024:12:00:00 +0000",
  "routeKey": "$connect",
  "status": "200",
  "protocol": "WebSocket",
  "responseLength": "0",
  "integrationErrorMessage": ""
}
```

## Verification

After applying these changes:

### 1. Check REST API logs are working
```bash
aws logs tail /aws/apigateway/${environment}-chatbot-api --follow
```

### 2. Check WebSocket logs are now working
```bash
aws logs tail /aws/apigateway/${environment}-websocket --follow
```

### 3. Test WebSocket connection
When you connect to the WebSocket, you should now see logs in the WebSocket log group showing:
- `$connect` route invocations
- `chat_message` route invocations
- `$disconnect` route invocations

## Benefits

1. **WebSocket visibility**: You can now see all WebSocket connection activity
2. **Debugging**: Easier to troubleshoot WebSocket connection issues
3. **Audit trail**: Complete record of all API Gateway activity
4. **No orphaned resources**: Removed unused log group from monitoring module
5. **Consistent logging**: Both REST and WebSocket APIs now properly configured

## Related Files
- `terraform/modules/monitoring/main.tf` - Removed orphaned log group
- `terraform/modules/monitoring/outputs.tf` - Removed from outputs
- `terraform/modules/websocket/main.tf` - Added access_log_settings
- `terraform/LOGGING_GUIDE.md` - Updated with correct log group names
