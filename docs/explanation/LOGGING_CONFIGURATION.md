# API Gateway Logging Configuration

## Overview

This document describes the CloudWatch logging configuration for the REST API Gateway, which provides comprehensive audit trails for all API requests and responses as required by Requirement 11.1.

## Logging Components

### 1. CloudWatch Log Group

**Resource**: `aws_cloudwatch_log_group.api_logs`

- **Log Group Name**: `/aws/apigateway/${environment}-chatbot-api`
- **Retention Period**: 365 days (for compliance requirements)
- **Purpose**: Stores all API Gateway access logs and execution logs

### 2. Access Logs

**Configuration**: `aws_api_gateway_stage.chatbot.access_log_settings`

Access logs capture metadata about each API request in structured JSON format:

```json
{
  "requestId": "unique-request-id",
  "ip": "client-ip-address",
  "caller": "aws-caller-identity",
  "user": "authenticated-user",
  "requestTime": "timestamp",
  "httpMethod": "GET|POST|DELETE",
  "resourcePath": "/auth/login",
  "status": 200,
  "protocol": "HTTP/1.1",
  "responseLength": 1234,
  "integrationLatency": 100,
  "responseLatency": 150,
  "errorMessage": "error-if-any",
  "errorMessageString": "detailed-error",
  "authorizerError": "authorizer-error-if-any",
  "integrationErrorMessage": "integration-error-if-any"
}
```

### 3. Execution Logs

**Configuration**: `aws_api_gateway_method_settings.chatbot`

Execution logs capture detailed request/response information:

- **Logging Level**: `INFO`
- **Data Trace Enabled**: `true` - Logs full request and response payloads
- **Metrics Enabled**: `true` - Emits CloudWatch metrics
- **Method Path**: `*/*` - Applies to all methods and resources

## What Gets Logged

### Access Logs (Every Request)
- Request ID and timestamp
- Client IP address
- HTTP method and resource path
- Response status code
- Request/response latency
- Error messages (if any)
- Authenticated user information

### Execution Logs (When data_trace_enabled = true)
- Full request headers
- Full request body
- Full response headers
- Full response body
- Integration request/response
- Lambda function execution details

## IAM Permissions

The API Gateway requires permissions to write logs to CloudWatch:

**Role**: `aws_iam_role.api_gateway_cloudwatch`
**Policy**: `AmazonAPIGatewayPushToCloudWatchLogs` (AWS managed policy)

This role is configured at the account level via `aws_api_gateway_account.main`.

## Querying Logs

### CloudWatch Logs Insights Queries

**Find all failed requests:**
```
fields @timestamp, requestId, httpMethod, resourcePath, status, errorMessage
| filter status >= 400
| sort @timestamp desc
```

**Find requests by user:**
```
fields @timestamp, requestId, httpMethod, resourcePath, status
| filter user = "specific-user-id"
| sort @timestamp desc
```

**Calculate average latency:**
```
fields @timestamp, responseLatency
| stats avg(responseLatency) as avgLatency by bin(5m)
```

**Find slow requests:**
```
fields @timestamp, requestId, httpMethod, resourcePath, responseLatency
| filter responseLatency > 2000
| sort responseLatency desc
```

## Compliance and Audit Trail

This logging configuration satisfies Requirement 11.1:

> "WHEN any user action occurs, THE Audit_Logger SHALL record the user ID, action type, timestamp, and IP address"

The access logs capture:
- ✅ User ID (via `user` and `caller` fields)
- ✅ Action type (via `httpMethod` and `resourcePath`)
- ✅ Timestamp (via `requestTime`)
- ✅ IP address (via `ip` field)

Additionally, execution logs with `data_trace_enabled = true` provide full request/response bodies for detailed audit trails.

## Log Retention

Logs are retained for **365 days** to meet compliance requirements (Requirement 11.5).

After 365 days, logs are automatically deleted by CloudWatch.

## Cost Considerations

CloudWatch Logs pricing:
- **Ingestion**: $0.50 per GB
- **Storage**: $0.03 per GB per month
- **Insights Queries**: $0.005 per GB scanned

For moderate usage (1000 requests/day with 5KB average log size):
- Daily ingestion: ~5 MB = $0.0025/day
- Monthly storage: ~150 MB = $0.0045/month
- Total: ~$0.08/month

## Security Considerations

### Sensitive Data Redaction

The logging configuration does NOT automatically redact sensitive data from request/response bodies. Consider:

1. **Passwords**: Never log passwords in plain text
2. **Session Tokens**: Redact or hash tokens in logs
3. **PII**: Be cautious with personally identifiable information

### Recommendations

For production deployments:
1. Implement log filtering to redact sensitive fields
2. Use AWS KMS to encrypt log data at rest
3. Restrict CloudWatch Logs access using IAM policies
4. Enable CloudWatch Logs Insights for security monitoring

## Monitoring and Alerting

Consider setting up CloudWatch alarms for:
- High error rate (status >= 500)
- Authentication failures (status = 401/403)
- Rate limit violations (status = 429)
- Slow response times (responseLatency > 2000ms)

## References

- [API Gateway CloudWatch Logging](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html)
- [CloudWatch Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- Requirement 11.1: Audit Logging and Compliance
