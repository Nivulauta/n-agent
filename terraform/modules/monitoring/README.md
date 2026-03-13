# Monitoring Module

This module provides comprehensive monitoring, logging, and alerting for the AWS Claude RAG Agent system.

## Overview

The monitoring module creates:
- CloudWatch Log Groups for audit logging and application logs
- CloudWatch Alarms for critical system metrics
- CloudWatch Dashboard for real-time system visibility
- Integration with SNS for alarm notifications

## Components

### Log Groups

**Audit Log Groups** (365-day retention):
- `/aws/lambda/chatbot/audit/user-actions` - User authentication, queries, uploads
- `/aws/lambda/chatbot/audit/api-calls` - Bedrock, OpenSearch, S3 API calls
- `/aws/lambda/chatbot/audit/document-operations` - Document upload, processing, deletion

**Lambda Log Groups** (365-day retention):
- `/aws/lambda/{environment}-chatbot-document-processor`
- `/aws/lambda/{environment}-chatbot-embedding-generator`
- `/aws/lambda/{environment}-chatbot-upload-handler`

### CloudWatch Alarms

The module configures 7 alarms monitoring critical metrics:

1. **Response Time Threshold** - Alerts when query latency > 2s
2. **High Error Rate** - Alerts when Lambda error rate > 5%
3. **Bedrock Throttling** - Alerts on Bedrock API throttling
4. **API Gateway Error Rate** - Alerts when API error rate > 5%
5. **High Latency (WebSocket)** - Alerts on WebSocket handler delays
6. **Lambda Errors** - General Lambda error monitoring
7. **API Gateway 5XX** - Server-side error monitoring

See [ALARMS.md](./ALARMS.md) for detailed alarm documentation.

### CloudWatch Dashboard

The dashboard displays:
- Request rate (REST API and WebSocket)
- Error rate (API Gateway and Lambda)
- Latency percentiles (p50, p95, p99)
- Bedrock token usage and cost estimates
- Cache hit rate
- Concurrent user count
- OpenSearch query latency
- Lambda invocations by function
- DynamoDB capacity usage
- S3 storage metrics
- ElastiCache Redis performance

## Usage

```hcl
module "monitoring" {
  source = "./modules/monitoring"

  environment             = "dev"
  system_alerts_topic_arn = module.notifications.system_alerts_topic_arn
  aws_region              = "us-east-2"
}
```

## Inputs

| Name | Description | Type | Required |
|------|-------------|------|----------|
| environment | Environment name | string | Yes |
| system_alerts_topic_arn | SNS topic ARN for alarm notifications | string | No |
| aws_region | AWS region for CloudWatch metrics | string | No (default: us-east-2) |

## Outputs

| Name | Description |
|------|-------------|
| log_group_names | Map of CloudWatch log group names |
| log_group_arns | Map of CloudWatch log group ARNs |
| alarm_arns | Map of CloudWatch alarm ARNs |
| dashboard_name | CloudWatch dashboard name |
| dashboard_arn | CloudWatch dashboard ARN |

## Alarm Notifications

To receive alarm notifications:

1. Subscribe to the SNS topic:
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT_ID:dev-chatbot-system-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

2. Confirm the subscription via email

3. You'll receive notifications when alarms trigger

## Viewing Logs

### CloudWatch Logs Insights Queries

**Query user actions:**
```
fields @timestamp, userId, eventType, metadata
| filter eventType in ["login", "logout", "query", "upload", "delete"]
| sort @timestamp desc
| limit 100
```

**Query API calls:**
```
fields @timestamp, service, operation, userId, duration, statusCode
| filter service = "bedrock"
| stats avg(duration) as avg_duration, sum(tokenCount) as total_tokens by operation
```

**Query document operations:**
```
fields @timestamp, operation, documentId, userId, status
| filter status = "failed"
| sort @timestamp desc
```

## Accessing the Dashboard

1. Navigate to CloudWatch Console
2. Select "Dashboards" from the left menu
3. Open `{environment}-chatbot-system-monitoring`
4. View real-time metrics and system health

## Cost Considerations

- Log retention: 365 days for all log groups
- Dashboard: No additional cost
- Alarms: $0.10 per alarm per month (7 alarms = $0.70/month)
- Logs Insights queries: $0.005 per GB scanned

## Requirements Validation

This module validates:
- **Requirement 11.1-11.5:** Comprehensive audit logging with 365-day retention
- **Requirement 15.1:** Lambda execution duration metrics
- **Requirement 15.2:** OpenSearch query latency metrics
- **Requirement 15.3:** Bedrock token usage metrics
- **Requirement 15.4:** CloudWatch dashboard with key performance indicators
- **Requirement 15.5:** CloudWatch alarms for response time, error rate, and throttling

## Related Documentation

- [ALARMS.md](./ALARMS.md) - Detailed alarm configuration and response procedures
- [DASHBOARD.md](./DASHBOARD.md) - Dashboard widget descriptions
- [METRICS_GUIDE.md](./METRICS_GUIDE.md) - Custom metrics documentation
- [AUDIT_LOGS.md](./AUDIT_LOGS.md) - Audit logging schema and queries
