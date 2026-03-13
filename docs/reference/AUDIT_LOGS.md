# Audit Log Groups Configuration

This document describes the CloudWatch Log Groups configured for the audit logging system.

## Overview

Three dedicated log groups have been created to support the audit logger implementation, matching the LOG_GROUPS constants defined in `lambda/shared/audit-logger/src/types.ts`.

## Log Groups

### 1. User Actions Log Group
- **Name**: `/aws/lambda/chatbot/audit/user-actions`
- **Retention**: 365 days
- **Purpose**: Records all user actions including login, logout, query, upload, and delete operations
- **Validates**: Requirement 11.1

**Logged Fields**:
- eventType (login, logout, query, upload, delete)
- userId
- sessionId
- timestamp
- ipAddress
- userAgent
- metadata (optional)

### 2. API Calls Log Group
- **Name**: `/aws/lambda/chatbot/audit/api-calls`
- **Retention**: 365 days
- **Purpose**: Records all external API calls to services like Bedrock, OpenSearch, and S3
- **Validates**: Requirement 11.3

**Logged Fields**:
- service (bedrock, opensearch, s3)
- operation
- requestId
- userId
- timestamp
- duration
- statusCode
- tokenCount (optional)

### 3. Document Operations Log Group
- **Name**: `/aws/lambda/chatbot/audit/document-operations`
- **Retention**: 365 days
- **Purpose**: Records all document-related operations including uploads, deletions, and processing
- **Validates**: Requirement 11.2

**Logged Fields**:
- operation (upload, delete, process)
- documentId
- documentName
- userId
- timestamp
- fileSize (optional)
- status (success, failed)
- errorMessage (optional)

## Compliance

All log groups are configured with:
- **365-day retention** for compliance requirements (Requirement 11.5)
- **Structured JSON logging** for easy parsing and analysis (Requirement 11.4)
- **Tamper-evident storage** via CloudWatch Logs (Requirement 11.4)
- **Environment tagging** for resource organization
- **Category tagging** for log type identification

## Usage

The audit logger automatically routes events to the appropriate log group based on event type:

```typescript
import { logUserAction, logAPICall, logDocumentOperation } from 'audit-logger';

// User action logging
await logUserAction({
  eventType: 'login',
  userId: 'user-123',
  sessionId: 'session-456',
  timestamp: Date.now(),
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0'
});

// API call logging
await logAPICall({
  service: 'bedrock',
  operation: 'InvokeModel',
  requestId: 'req-789',
  userId: 'user-123',
  timestamp: Date.now(),
  duration: 1500,
  statusCode: 200,
  tokenCount: 150
});

// Document operation logging
await logDocumentOperation({
  operation: 'upload',
  documentId: 'doc-001',
  documentName: 'report.pdf',
  userId: 'user-123',
  timestamp: Date.now(),
  fileSize: 1024000,
  status: 'success'
});
```

## Querying Logs

Use CloudWatch Logs Insights to query audit logs:

```sql
-- Find all failed login attempts
fields @timestamp, userId, ipAddress
| filter eventType = "login" and status = "failed"
| sort @timestamp desc

-- Find all Bedrock API calls by user
fields @timestamp, operation, duration, tokenCount
| filter service = "bedrock" and userId = "user-123"
| sort @timestamp desc

-- Find all document uploads in the last 24 hours
fields @timestamp, documentName, fileSize, status
| filter operation = "upload" and @timestamp > ago(24h)
| sort @timestamp desc
```

## Terraform Outputs

The log group names and ARNs are exported via module outputs:

```hcl
module.monitoring.log_group_names.audit_user_actions
module.monitoring.log_group_names.audit_api_calls
module.monitoring.log_group_names.audit_document_operations

module.monitoring.log_group_arns.audit_user_actions
module.monitoring.log_group_arns.audit_api_calls
module.monitoring.log_group_arns.audit_document_operations
```

## IAM Permissions

Lambda functions using the audit logger require the following CloudWatch Logs permissions:

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
