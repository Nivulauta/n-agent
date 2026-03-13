# WebSocket Connection Troubleshooting

## Current Error

```
WebSocket connection to 'wss://ftj9zrh5h0.execute-api.us-east-2.amazonaws.com/dev?token=...' failed: 
WebSocket is closed before the connection is established.
```

## Root Causes

### 1. WebSocket API Gateway Not Deployed
The WebSocket API Gateway endpoint may not be deployed or configured correctly.

**Check:**
```bash
aws apigatewayv2 get-apis --region us-east-2 | grep ftj9zrh5h0
```

**Solution:**
Deploy the WebSocket API Gateway using Terraform:
```bash
cd terraform
terraform apply -target=module.websocket
```

### 2. Lambda Authorizer Not Configured
The WebSocket connection requires a Lambda authorizer to validate the JWT token.

**Check:**
- Verify Lambda authorizer is deployed
- Check authorizer is attached to $connect route
- Verify authorizer returns proper IAM policy

**Solution:**
Deploy the authentication module:
```bash
cd terraform
terraform apply -target=module.auth
```

### 3. CORS/Connection Policy Issues
WebSocket connections may be blocked by CORS or connection policies.

**Check:**
- Verify API Gateway has proper route selection expression
- Check Lambda function has WebSocket permissions
- Verify VPC configuration if Lambda is in VPC

### 4. Token Format Issues
The token might not be in the expected format for the authorizer.

**Current Token Format:**
```
?token=<JWT_TOKEN>
```

**Alternative Formats to Try:**
- Header: `Sec-WebSocket-Protocol: <JWT_TOKEN>`
- Query: `?authorization=Bearer+<JWT_TOKEN>`

## Message Parsing Error

```
Failed to parse WebSocket message: TypeError: Cannot destructure property 'messageId' of 'message.data' as it is undefined
```

### Root Cause
The WebSocket message structure from the backend doesn't match the expected format.

**Expected Format:**
```json
{
  "type": "chat_response",
  "data": {
    "messageId": "msg-123",
    "content": "Hello",
    "isComplete": false,
    "retrievedChunks": []
  }
}
```

**Possible Actual Format:**
```json
{
  "type": "chat_response",
  "messageId": "msg-123",
  "content": "Hello"
}
```

### Solution
The frontend has been updated with:
1. Safety checks for `message.data`
2. Default values for missing fields
3. Better error logging
4. Try-catch blocks around message handling

## Quick Fixes Applied

### 1. Enhanced Error Handling in Chat.tsx
```typescript
// Added safety check
if (!message.data) {
    console.error('Chat response missing data:', message);
    return;
}

// Added default values
messageId: messageId || `msg-${Date.now()}`,
content: content || '',
```

### 2. Added Logging
```typescript
console.log('Received WebSocket message:', message);
```

### 3. Added Try-Catch
```typescript
try {
    switch (message.type) {
        // ... handle messages
    }
} catch (error) {
    console.error('Error handling WebSocket message:', error, message);
}
```

## Testing WebSocket Connection

### 1. Test with wscat
```bash
npm install -g wscat
wscat -c "wss://ftj9zrh5h0.execute-api.us-east-2.amazonaws.com/dev?token=YOUR_TOKEN"
```

### 2. Test with curl
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(echo -n "test" | base64)" \
  "https://ftj9zrh5h0.execute-api.us-east-2.amazonaws.com/dev?token=YOUR_TOKEN"
```

### 3. Check CloudWatch Logs
```bash
aws logs tail /aws/lambda/websocket-connect --follow --region us-east-2
aws logs tail /aws/lambda/websocket-disconnect --follow --region us-east-2
aws logs tail /aws/lambda/chat-handler --follow --region us-east-2
```

## Backend Requirements

For the WebSocket to work, the following must be deployed:

### 1. WebSocket API Gateway
- ✅ API Gateway WebSocket API created
- ✅ Routes configured: $connect, $disconnect, chat_message
- ✅ Integration with Lambda functions
- ✅ Deployment stage created

### 2. Lambda Functions
- ✅ WebSocket connection handler (handles $connect)
- ✅ WebSocket disconnection handler (handles $disconnect)
- ✅ Chat message handler (handles chat_message)
- ✅ Lambda authorizer (validates JWT tokens)

### 3. DynamoDB Tables
- ✅ Connections table (stores connectionId → userId mapping)
- ✅ Sessions table (validates session tokens)

### 4. IAM Permissions
- ✅ Lambda can write to DynamoDB
- ✅ Lambda can invoke Bedrock
- ✅ Lambda can post to WebSocket connections
- ✅ API Gateway can invoke Lambda

## Deployment Checklist

Run these commands to deploy the required infrastructure:

```bash
# 1. Deploy networking and security
cd terraform
terraform apply -target=module.networking
terraform apply -target=module.security

# 2. Deploy authentication
terraform apply -target=module.auth

# 3. Deploy WebSocket infrastructure
terraform apply -target=module.websocket
terraform apply -target=module.websocket-handlers

# 4. Deploy chat handler
terraform apply -target=module.chat-handler

# 5. Verify deployment
aws apigatewayv2 get-apis --region us-east-2
aws lambda list-functions --region us-east-2 | grep websocket
```

## Temporary Workaround

Until the WebSocket backend is deployed, you can:

1. **Mock WebSocket Connection**
   - Create a mock WebSocket that simulates responses
   - Useful for frontend development

2. **Use REST API Polling**
   - Fall back to polling a REST endpoint
   - Less efficient but works without WebSocket

3. **Local WebSocket Server**
   - Run a local WebSocket server for testing
   - Use `ws` npm package

## Environment Variables

Verify your `.env` file has the correct WebSocket URL:

```env
VITE_WS_URL=wss://ftj9zrh5h0.execute-api.us-east-2.amazonaws.com/dev
```

If the WebSocket API is not deployed, you can temporarily comment it out:
```env
# VITE_WS_URL=wss://ftj9zrh5h0.execute-api.us-east-2.amazonaws.com/dev
VITE_WS_URL=ws://localhost:3001  # Use local server for testing
```

## Next Steps

1. **Check Backend Deployment Status**
   ```bash
   cd terraform
   terraform plan
   ```

2. **Deploy Missing Components**
   ```bash
   terraform apply
   ```

3. **Test Connection**
   - Use browser DevTools Network tab
   - Look for WebSocket connection
   - Check for 101 Switching Protocols response

4. **Monitor Logs**
   - Check CloudWatch logs for Lambda errors
   - Look for authorization failures
   - Check for connection timeouts

## Common Issues

### Issue: 403 Forbidden
**Cause:** Lambda authorizer rejecting the token
**Solution:** Check token format and authorizer logic

### Issue: 502 Bad Gateway
**Cause:** Lambda function error or timeout
**Solution:** Check Lambda logs in CloudWatch

### Issue: Connection Timeout
**Cause:** Lambda in VPC without NAT Gateway
**Solution:** Add NAT Gateway or remove VPC configuration

### Issue: Immediate Disconnect
**Cause:** $connect handler returning error
**Solution:** Check $connect Lambda logs

## Support

If issues persist:
1. Check all Lambda function logs in CloudWatch
2. Verify API Gateway configuration
3. Test with wscat or Postman
4. Review Terraform state for missing resources
