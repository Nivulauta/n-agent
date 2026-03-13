# Audit Logger Integration Summary

This document describes the integration of the audit logger with existing Lambda functions.

## Overview

The audit logger has been integrated into the authentication and WebSocket Lambda functions to provide comprehensive audit trails for user actions. All audit logs are written to dedicated CloudWatch Log Groups with 365-day retention for compliance.

## Integrated Lambda Functions

### 1. Login Handler (`lambda/auth/login`)

**Audit Events Logged:**

- **Successful Login**
  - Event Type: `login`
  - Metadata: success=true, username, roles
  - Captures: userId, sessionId, IP address, user agent

- **Failed Login - User Not Found**
  - Event Type: `login`
  - Metadata: success=false, reason='user_not_found', username
  - Captures: IP address, user agent

- **Failed Login - Invalid Password**
  - Event Type: `login`
  - Metadata: success=false, reason='invalid_password', username
  - Captures: userId, IP address, user agent

**Log Group:** `/aws/lambda/chatbot/audit/user-actions`

**Example Log Entry:**
```json
{
  "eventType": "login",
  "userId": "user-123",
  "sessionId": "abc-def-ghi",
  "timestamp": 1234567890000,
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "success": true,
    "username": "john.doe",
    "roles": ["user"]
  }
}
```

### 2. Logout Handler (`lambda/auth/logout`)

**Audit Events Logged:**

- **Successful Logout**
  - Event Type: `logout`
  - Metadata: success=true
  - Captures: userId, sessionId, IP address, user agent

**Log Group:** `/aws/lambda/chatbot/audit/user-actions`

**Example Log Entry:**
```json
{
  "eventType": "logout",
  "userId": "user-123",
  "sessionId": "abc-def-ghi",
  "timestamp": 1234567890000,
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "success": true
  }
}
```

### 3. WebSocket Connect Handler (`lambda/websocket/connect`)

**Audit Events Logged:**

- **WebSocket Connection Established**
  - Event Type: `query` (using query as the closest match for connection events)
  - Metadata: action='websocket_connect', connectionId
  - Captures: userId, connectionId as sessionId

**Log Group:** `/aws/lambda/chatbot/audit/user-actions`

**Example Log Entry:**
```json
{
  "eventType": "query",
  "userId": "user-123",
  "sessionId": "connection-xyz",
  "timestamp": 1234567890000,
  "ipAddress": "websocket",
  "userAgent": "websocket",
  "metadata": {
    "action": "websocket_connect",
    "connectionId": "connection-xyz"
  }
}
```

### 4. WebSocket Disconnect Handler (`lambda/websocket/disconnect`)

**Audit Events Logged:**

- **WebSocket Connection Closed**
  - Event Type: `query`
  - Metadata: action='websocket_disconnect', connectionId
  - Captures: userId (retrieved from connection record), connectionId

**Log Group:** `/aws/lambda/chatbot/audit/user-actions`

**Example Log Entry:**
```json
{
  "eventType": "query",
  "userId": "user-123",
  "sessionId": "connection-xyz",
  "timestamp": 1234567890000,
  "ipAddress": "websocket",
  "userAgent": "websocket",
  "metadata": {
    "action": "websocket_disconnect",
    "connectionId": "connection-xyz"
  }
}
```

## Implementation Details

### Import Statement

All Lambda functions import the audit logger using:
```typescript
import { logUserAction } from '../../../shared/audit-logger/dist/audit-logger.js';
```

### Error Handling

Audit logging is implemented with try-catch blocks to ensure that logging failures don't break the main application flow. The audit logger itself handles CloudWatch errors gracefully by:
1. Logging errors to console
2. Not throwing exceptions that would interrupt the Lambda execution

### Performance Impact

- Audit logging is asynchronous and uses `await` to ensure logs are written before the Lambda completes
- CloudWatch Logs API calls add minimal latency (~50-100ms)
- Logs are written in parallel with other operations where possible

## Compliance

The integration satisfies the following requirements:

- **Requirement 11.1**: User actions (login, logout) are logged with userId, action type, timestamp, and IP address
- **Requirement 11.2**: Document operations will be logged (to be implemented in document handler)
- **Requirement 11.3**: API calls will be logged (to be implemented in Bedrock/OpenSearch handlers)
- **Requirement 11.4**: Logs are stored in CloudWatch Logs in structured JSON format
- **Requirement 11.5**: Logs are retained for 365 days

## Future Integrations

The following Lambda functions should be integrated with audit logging when implemented:

### Document Operations
- **Upload Handler**: Log document uploads with fileSize, documentId, userId
- **Document Processor**: Log processing status (success/failed) with documentId
- **Delete Handler**: Log document deletions with documentId, userId

### API Calls
- **Bedrock Service**: Log all Claude API calls with tokenCount, duration, userId
- **OpenSearch Service**: Log all vector searches with query, resultCount, duration
- **S3 Operations**: Log document retrievals and storage operations

### Example for Future Implementation:

```typescript
// In document upload handler
import { logDocumentOperation } from '../../../shared/audit-logger/dist/audit-logger.js';

await logDocumentOperation({
  operation: 'upload',
  documentId: 'doc-123',
  documentName: 'report.pdf',
  userId: 'user-456',
  timestamp: Date.now(),
  fileSize: 1024000,
  status: 'success',
});

// In Bedrock service
import { logAPICall } from '../../../shared/audit-logger/dist/audit-logger.js';

await logAPICall({
  service: 'bedrock',
  operation: 'InvokeModel',
  requestId: 'req-789',
  userId: 'user-123',
  timestamp: Date.now(),
  duration: 1500,
  statusCode: 200,
  tokenCount: 150,
});
```

## Querying Audit Logs

Use CloudWatch Logs Insights to query audit logs:

### Find all login attempts for a user
```sql
fields @timestamp, eventType, metadata.success, metadata.reason, ipAddress
| filter userId = "user-123" and eventType = "login"
| sort @timestamp desc
```

### Find all failed login attempts
```sql
fields @timestamp, userId, metadata.username, metadata.reason, ipAddress
| filter eventType = "login" and metadata.success = false
| sort @timestamp desc
```

### Find all WebSocket connections in the last hour
```sql
fields @timestamp, userId, metadata.connectionId
| filter metadata.action = "websocket_connect" and @timestamp > ago(1h)
| sort @timestamp desc
```

### Track user session activity
```sql
fields @timestamp, eventType, metadata.action, sessionId
| filter userId = "user-123"
| sort @timestamp asc
```

## Testing

All Lambda functions have been successfully built with the audit logger integration:
- ✅ `lambda/auth/login` - Built successfully
- ✅ `lambda/auth/logout` - Built successfully
- ✅ `lambda/websocket/connect` - Built successfully
- ✅ `lambda/websocket/disconnect` - Built successfully

## Deployment

When deploying these Lambda functions, ensure:
1. The audit logger shared module is included in the deployment package
2. Lambda execution roles have CloudWatch Logs permissions:
   ```json
   {
     "Effect": "Allow",
     "Action": [
       "logs:CreateLogStream",
       "logs:PutLogEvents",
       "logs:DescribeLogStreams"
     ],
     "Resource": [
       "arn:aws:logs:*:*:log-group:/aws/lambda/chatbot/audit/*"
     ]
   }
   ```
3. The CloudWatch Log Groups are created via Terraform before deploying Lambda functions
