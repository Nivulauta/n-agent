# WebSocket 403 Error Troubleshooting

## Problem
WebSocket connection fails with 403 Forbidden error when attempting to connect.

## Common Causes

### 1. Token Not Found or Invalid Format
The WebSocket authorizer expects the token as a query parameter:
```
wss://your-api.execute-api.region.amazonaws.com/stage?token=YOUR_JWT_TOKEN
```

**Check:**
- Token is properly URL-encoded
- Token is passed as query parameter, not in headers
- Token doesn't have "Bearer " prefix in query string

### 2. Token Expired
JWT tokens expire after 24 hours by default.

**Check:**
```javascript
// In browser console
const token = JSON.parse(localStorage.getItem('chatbot_session_token'));
console.log('Token expires at:', new Date(token.expiresAt));
console.log('Current time:', new Date());
console.log('Is expired:', Date.now() >= token.expiresAt);
```

**Solution:** Log out and log back in to get a fresh token.

### 3. Session Not Found in DynamoDB
The authorizer validates the session exists in DynamoDB.

**Check CloudWatch Logs:**
```
Log Group: /aws/lambda/dev-authorizer
Look for: "Session not found in DynamoDB"
```

**Possible causes:**
- Session was deleted (logout)
- Session expired (TTL)
- Session never created (login issue)

### 4. JWT Secret Mismatch
The authorizer uses JWT_SECRET environment variable to verify tokens.

**Check:**
- JWT_SECRET in authorizer Lambda matches login Lambda
- Environment variables are properly set in Terraform

### 5. CORS/Network Issues
Browser may block WebSocket connection due to CORS or network policies.

**Check:**
- WebSocket URL is correct (wss:// not ws://)
- No browser extensions blocking WebSocket
- Network allows WebSocket connections

## Debugging Steps

### Step 1: Check Token in Browser Console
```javascript
// Get token from storage
const sessionToken = JSON.parse(localStorage.getItem('chatbot_session_token'));
console.log('Token:', sessionToken);
console.log('Token string:', sessionToken.token);
console.log('Expires at:', new Date(sessionToken.expiresAt));
console.log('User ID:', sessionToken.userId);

// Check if expired
if (Date.now() >= sessionToken.expiresAt) {
    console.error('Token is expired!');
} else {
    console.log('Token is valid');
}
```

### Step 2: Test WebSocket Connection Manually
```javascript
// In browser console
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;
const wsUrl = 'wss://YOUR_API_URL/dev';
const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

ws.onopen = () => console.log('Connected!');
ws.onerror = (error) => console.error('Error:', error);
ws.onclose = (event) => console.log('Closed:', event.code, event.reason);
```

### Step 3: Check CloudWatch Logs

#### Authorizer Lambda Logs
```
Log Group: /aws/lambda/dev-authorizer
```

Look for:
- "No authorization token provided"
- "Token expired"
- "Session not found in DynamoDB"
- "Session expired in DynamoDB"
- "Authorization failed"

#### WebSocket Connect Lambda Logs
```
Log Group: /aws/lambda/dev-websocket-connect
```

Look for:
- "No userId found in authorizer context"
- "Error storing connection"

### Step 4: Verify Token Structure
```javascript
// Decode JWT (without verification)
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('JWT Payload:', payload);
console.log('User ID:', payload.userId);
console.log('Session ID:', payload.sessionId);
console.log('Expires:', new Date(payload.exp * 1000));
```

### Step 5: Check DynamoDB Session
Use AWS Console or CLI to verify session exists:
```bash
aws dynamodb get-item \
  --table-name dev-sessions \
  --key '{"PK":{"S":"SESSION#your-session-id"},"SK":{"S":"SESSION#your-session-id"}}'
```

## Solutions

### Solution 1: Refresh Token
If token is expired, log out and log back in:
```javascript
// In browser console
localStorage.clear();
// Then refresh page and log in again
```

### Solution 2: Check Token Encoding
Ensure token is properly URL-encoded:
```javascript
// The WebSocket manager should do this:
const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
```

### Solution 3: Verify Authorizer Configuration
Check Terraform configuration:
```hcl
resource "aws_apigatewayv2_authorizer" "websocket" {
  api_id           = aws_apigatewayv2_api.websocket.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = var.authorizer_invoke_arn
  identity_sources = ["route.request.querystring.token"]  # Must match query param
  name             = "${var.environment}-websocket-authorizer"
}
```

### Solution 4: Check Lambda Permissions
Ensure API Gateway can invoke the authorizer Lambda:
```hcl
resource "aws_lambda_permission" "authorizer_websocket" {
  statement_id  = "AllowAPIGatewayInvokeWebSocket"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*"
}
```

## Testing Checklist

- [ ] Token exists in localStorage
- [ ] Token is not expired
- [ ] Token format is correct (JWT with 3 parts)
- [ ] Session exists in DynamoDB
- [ ] Session is not expired
- [ ] Authorizer Lambda has correct JWT_SECRET
- [ ] API Gateway has authorizer configured
- [ ] Lambda permissions are correct
- [ ] WebSocket URL is correct (wss://)
- [ ] Token is URL-encoded in query string

## Common Error Messages

### "No authorization token provided"
**Cause:** Token not found in query parameters
**Solution:** Check WebSocket URL includes `?token=...`

### "Token expired"
**Cause:** JWT token exp claim is in the past
**Solution:** Log out and log back in

### "Invalid session"
**Cause:** Session not found in DynamoDB
**Solution:** Log out and log back in to create new session

### "Session expired in DynamoDB"
**Cause:** Session expiresAt timestamp is in the past
**Solution:** Log out and log back in

### "No userId found in authorizer context"
**Cause:** Authorizer didn't return userId in context
**Solution:** Check authorizer Lambda logs and fix authorization logic

## Prevention

### 1. Token Refresh
Implement automatic token refresh before expiration:
```typescript
// Check token expiration every minute
setInterval(() => {
    const token = getToken();
    if (token && isTokenExpired(token)) {
        logout(); // Or refresh token
    }
}, 60000);
```

### 2. Better Error Messages
Show specific error messages to users:
```typescript
ws.onclose = (event) => {
    if (event.code === 1006) {
        // Abnormal closure - likely 403
        setError('Authentication failed. Please log in again.');
    }
};
```

### 3. Automatic Reconnection
The WebSocketManager already implements reconnection with exponential backoff.

## Related Files
- `frontend/src/utils/websocket.ts` - WebSocket manager
- `frontend/src/components/Chat.tsx` - Chat component using WebSocket
- `lambda/auth/authorizer/src/index.ts` - Lambda authorizer
- `lambda/websocket/connect/src/index.ts` - WebSocket connect handler
- `terraform/modules/websocket/main.tf` - WebSocket API configuration

## Additional Resources
- [AWS API Gateway WebSocket Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html)
- [JWT Token Structure](https://jwt.io/)
- [WebSocket Error Codes](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code)
