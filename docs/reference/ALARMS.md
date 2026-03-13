# CloudWatch Alarms Configuration

This document describes the CloudWatch alarms configured for the AWS Claude RAG Agent system and provides guidance on responding to alarm notifications.

## Overview

The system has 7 CloudWatch alarms that monitor critical performance and reliability metrics. All alarms send notifications to the SNS topic configured in the notifications module when triggered.

## Configured Alarms

### 1. Response Time Threshold Alarm

**Alarm Name:** `{environment}-chatbot-response-time-exceeded`

**Metric:** `query_latency` (ChatbotMetrics namespace)

**Threshold:** Average > 2000ms over 3 consecutive 1-minute periods

**Purpose:** Alerts when query response times exceed the 2-second SLA requirement.

**Response Actions:**
- Check CloudWatch dashboard for latency breakdown (Bedrock, OpenSearch, cache)
- Review Lambda function memory allocation and cold start metrics
- Check OpenSearch cluster health and query performance
- Verify cache hit rate is above 30% target
- Consider scaling OpenSearch cluster or increasing Lambda memory

### 2. High Error Rate Alarm

**Alarm Name:** `{environment}-chatbot-high-error-rate`

**Metric:** Lambda error rate percentage

**Threshold:** Error rate > 5% over 2 consecutive 5-minute periods

**Purpose:** Alerts when Lambda function error rate exceeds acceptable threshold.

**Response Actions:**
- Check CloudWatch Logs for error messages and stack traces
- Review recent deployments or configuration changes
- Check external service availability (Bedrock, OpenSearch, DynamoDB)
- Verify IAM permissions are correctly configured
- Check for resource exhaustion (memory, timeout)

### 3. Bedrock Throttling Alarm

**Alarm Name:** `{environment}-chatbot-bedrock-throttling`

**Metric:** `BedrockThrottlingErrors` (ChatbotMetrics namespace)

**Threshold:** Sum > 5 throttling errors in 1 minute

**Purpose:** Alerts when Bedrock API is throttling requests.

**Response Actions:**
- Check Bedrock service quotas in AWS Service Quotas console
- Review request rate and consider implementing additional rate limiting
- Verify exponential backoff retry logic is functioning
- Check cache hit rate to reduce Bedrock API calls
- Request quota increase if sustained high usage is expected

### 4. API Gateway Error Rate Alarm

**Alarm Name:** `{environment}-chatbot-api-error-rate`

**Metric:** API Gateway 4XX + 5XX error rate percentage

**Threshold:** Error rate > 5% over 2 consecutive 5-minute periods

**Purpose:** Alerts when API Gateway error rate exceeds acceptable threshold.

**Response Actions:**
- Check API Gateway logs for error details
- Review authentication failures (4XX errors)
- Check Lambda function errors causing 5XX responses
- Verify API Gateway configuration and integrations
- Check for malicious traffic patterns or DDoS attempts

### 5. High Latency Alarm (WebSocket)

**Alarm Name:** `{environment}-chatbot-high-latency`

**Metric:** Lambda Duration (AWS/Lambda namespace)

**Threshold:** Average > 2000ms over 2 consecutive 5-minute periods

**Purpose:** Monitors WebSocket message handler Lambda function duration.

**Response Actions:**
- Check WebSocket message handler logs for slow operations
- Review Bedrock streaming response performance
- Check OpenSearch query latency
- Verify cache is functioning correctly
- Consider increasing Lambda memory allocation

### 6. Lambda Errors Alarm

**Alarm Name:** `{environment}-chatbot-lambda-errors`

**Metric:** Lambda Errors (AWS/Lambda namespace)

**Threshold:** Sum > 10 errors over 2 consecutive 5-minute periods

**Purpose:** General Lambda function error monitoring.

**Response Actions:**
- Identify which Lambda function(s) are generating errors
- Check CloudWatch Logs for error details
- Review recent code deployments
- Verify environment variables and configuration
- Check external service dependencies

### 7. API Gateway 5XX Errors Alarm

**Alarm Name:** `{environment}-chatbot-api-gateway-5xx`

**Metric:** 5XXError (AWS/ApiGateway namespace)

**Threshold:** Sum > 10 errors over 2 consecutive 5-minute periods

**Purpose:** Monitors server-side errors from API Gateway.

**Response Actions:**
- Check Lambda function errors causing 5XX responses
- Review API Gateway integration configuration
- Check for Lambda timeout issues
- Verify Lambda concurrency limits are not exceeded
- Check for resource exhaustion in backend services

## Alarm Configuration

All alarms are configured with:
- **treat_missing_data:** `notBreaching` - Missing data does not trigger alarms
- **alarm_actions:** SNS topic from notifications module
- **evaluation_periods:** Multiple periods to reduce false positives

## SNS Topic Configuration

Alarms send notifications to: `{environment}-chatbot-system-alerts`

To receive alarm notifications:
1. Subscribe to the SNS topic via AWS Console or CLI
2. Confirm the subscription via email
3. Configure email filters or integrate with incident management tools

## Testing Alarms

To test alarm configuration:

```bash
# Trigger response time alarm (simulate slow queries)
aws cloudwatch put-metric-data \
  --namespace ChatbotMetrics \
  --metric-name query_latency \
  --value 2500 \
  --timestamp $(date -u +%Y-%m-%dT%H:%M:%S)

# Trigger Bedrock throttling alarm
aws cloudwatch put-metric-data \
  --namespace ChatbotMetrics \
  --metric-name BedrockThrottlingErrors \
  --value 10 \
  --timestamp $(date -u +%Y-%m-%dT%H:%M:%S)
```

## Alarm Tuning

If alarms are too sensitive or not sensitive enough:

1. Adjust thresholds in `terraform/modules/monitoring/main.tf`
2. Modify evaluation periods for faster/slower detection
3. Update the Terraform configuration and apply changes
4. Monitor alarm behavior over time and iterate

## Related Documentation

- [CloudWatch Dashboard](./DASHBOARD.md) - System monitoring dashboard
- [Metrics Guide](./METRICS_GUIDE.md) - Custom metrics documentation
- [Audit Logs](./AUDIT_LOGS.md) - Audit logging configuration

## Requirements Validation

This alarm configuration validates:
- **Requirement 15.5:** System triggers CloudWatch alarms when response times exceed 2 seconds
- **Requirement 15.5:** System monitors error rates and alerts when exceeding thresholds
- **Requirement 15.5:** System monitors Bedrock throttling and alerts operators
