# WebSocket Lambda Deployment Guide

This guide covers building and deploying the WebSocket Lambda functions.

## Prerequisites

- Node.js 20.x or later
- npm
- AWS CLI configured with appropriate credentials
- Terraform (for infrastructure deployment)

## Building Lambda Functions

### Build All Functions

```bash
cd lambda/websocket
chmod +x build.sh
./build.sh
```

This will:
1. Build the shared utilities
2. Build the connect handler
3. Build the disconnect handler
4. Build the message handler

### Build Individual Functions

```bash
# Build shared utilities
cd lambda/websocket/shared
npm install
npm run build

# Build connect handler
cd lambda/websocket/connect
npm install
npm run build

# Build disconnect handler
cd lambda/websocket/disconnect
npm install
npm run build

# Build message handler
cd lambda/websocket/message
npm install
npm run build
```

## Deploying Infrastructure

The WebSocket infrastructure is deployed via Terraform modules:

```bash
cd terraform

# Initialize Terraform (first time only)
terraform init

# Plan the deployment
terraform plan

# Apply the changes
terraform apply
```

## Infrastructure Components

The deployment creates:

1. **WebSocket API Gateway**
   - Routes: $connect, $disconnect, chat_message
   - Lambda Authorizer for authentication
   - 10-minute connection timeout with keep-alive support

2. **Lambda Functions**
   - `{env}-websocket-connect` - Handles new connections
   - `{env}-websocket-disconnect` - Handles disconnections
   - `{env}-websocket-message` - Handles chat messages (placeholder)

3. **DynamoDB Table**
   - `{env}-chatbot-connections` - Stores active connections
   - GSI: userId-index for querying connections by user
   - TTL enabled for automatic cleanup after 10 minutes

4. **IAM Roles and Policies**
   - Least privilege access for each Lambda function
   - CloudWatch Logs permissions
   - DynamoDB access permissions
   - API Gateway Management API permissions

## Testing WebSocket Connection

### Using wscat

```bash
# Install wscat
npm install -g wscat

# Get the WebSocket URL from Terraform outputs
terraform output websocket_stage_url

# Connect with authentication token
wscat -c "wss://<api-id>.execute-api.<region>.amazonaws.com/<stage>?token=<jwt-token>"

# Send a test message
{"action": "chat_message", "data": {"message": "Hello", "sessionId": "test-session"}}
```

### Using JavaScript

```javascript
const ws = new WebSocket('wss://<api-id>.execute-api.<region>.amazonaws.com/<stage>?token=<jwt-token>');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    action: 'chat_message',
    data: {
      message: 'Hello',
      sessionId: 'test-session'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

## Monitoring

### CloudWatch Logs

Each Lambda function has its own log group:
- `/aws/lambda/{env}-websocket-connect`
- `/aws/lambda/{env}-websocket-disconnect`
- `/aws/lambda/{env}-websocket-message`

### API Gateway Logs

WebSocket API logs are available at:
- `/aws/apigateway/{env}-websocket`

### DynamoDB Metrics

Monitor the connections table:
- Read/Write capacity units
- Item count
- TTL deletions

## Troubleshooting

### Connection Fails with 401 Unauthorized

- Verify the JWT token is valid and not expired
- Check that the token is passed in the query string: `?token=<jwt-token>`
- Verify the Lambda Authorizer is configured correctly
- Check CloudWatch logs for the authorizer function

### Connection Fails with 500 Internal Server Error

- Check CloudWatch logs for the connect handler
- Verify DynamoDB table exists and has correct permissions
- Verify IAM role has necessary permissions

### Messages Not Being Received

- Check CloudWatch logs for the message handler
- Verify the connection is still active in DynamoDB
- Check that the message format is correct
- Verify API Gateway has permission to invoke Lambda

### Stale Connections (410 Gone)

- This is expected behavior when a connection is closed
- The MessageSender utility automatically removes stale connections
- Check CloudWatch logs to verify cleanup is working

## Security Considerations

1. **Authentication**: All connections require a valid JWT token
2. **Encryption**: All data is encrypted in transit (WSS protocol)
3. **TTL**: Connections automatically expire after 10 minutes
4. **IAM**: Least privilege access for all Lambda functions
5. **Logging**: All connections and messages are logged for audit

## Cost Optimization

1. **Connection TTL**: 10-minute timeout reduces stale connections
2. **On-Demand DynamoDB**: Pay only for actual usage
3. **Lambda Memory**: Optimized memory allocation (256-512 MB)
4. **CloudWatch Logs**: 365-day retention for compliance

## Next Steps

1. Implement the chat message handler (Task 17)
2. Add rate limiting to WebSocket connections
3. Implement keep-alive ping/pong mechanism
4. Add metrics and alarms for connection monitoring
5. Implement reconnection logic in the frontend
