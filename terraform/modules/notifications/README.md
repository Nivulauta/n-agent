# Notifications Module

This Terraform module creates SNS topics for system notifications in the Nivulauta Agent system.

## Overview

The module provisions three SNS topics for different notification purposes:

1. **Failed Processing Topic** - Notifications for failed document processing
2. **System Alerts Topic** - CloudWatch alarms and system-level alerts
3. **Operational Notifications Topic** - General operational events

All topics are encrypted using KMS and support optional email subscriptions.

## Features

- **KMS Encryption**: All topics encrypted at rest using customer-managed KMS keys
- **Email Subscriptions**: Optional email notifications for all topics
- **IAM Policies**: Least-privilege policies for service access
- **Multi-Service Support**: Lambda, CloudWatch, S3, and EventBridge can publish

## Usage

### Basic Usage

```hcl
module "notifications" {
  source = "./modules/notifications"

  environment = "dev"
  kms_key_id  = module.security.kms_key_id
}
```

### With Email Notifications

```hcl
module "notifications" {
  source = "./modules/notifications"

  environment = "prod"
  kms_key_id  = module.security.kms_key_id
  alert_email = "ops-team@example.com"
}
```

**Note**: Email subscriptions require manual confirmation. The subscriber will receive a confirmation email from AWS SNS.

## SNS Topics

### 1. Failed Processing Topic

**Purpose**: Notifications when document processing fails

**Publishers**:
- Lambda functions (document processor)

**Message Format**:
```json
{
  "subject": "Document Processing Failed: filename.pdf",
  "documentId": "doc-123",
  "filename": "document.pdf",
  "errorType": "PDFParsingError",
  "errorMessage": "Failed to parse PDF",
  "failedAt": "2024-01-15T10:30:00Z",
  "s3Location": "s3://bucket/failed/doc-123/document.pdf",
  "errorDetailsLocation": "s3://bucket/failed/doc-123/error.json"
}
```

**Use Cases**:
- Alert operations team of processing failures
- Trigger automated remediation workflows
- Track failure rates and patterns

### 2. System Alerts Topic

**Purpose**: CloudWatch alarms and system-level alerts

**Publishers**:
- CloudWatch Alarms

**Message Format**:
```json
{
  "AlarmName": "high-error-rate",
  "AlarmDescription": "Lambda error rate exceeded threshold",
  "NewStateValue": "ALARM",
  "NewStateReason": "Threshold Crossed: 5 errors in 5 minutes",
  "StateChangeTime": "2024-01-15T10:30:00.000Z",
  "Region": "us-east-1",
  "AlarmArn": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:high-error-rate"
}
```

**Use Cases**:
- High error rates
- Performance degradation
- Resource utilization alerts
- Security events

### 3. Operational Notifications Topic

**Purpose**: General operational events and notifications

**Publishers**:
- Lambda functions
- EventBridge rules
- S3 events

**Message Format**:
```json
{
  "eventType": "document_processed",
  "documentId": "doc-123",
  "status": "success",
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "pageCount": 10,
    "chunkCount": 25,
    "processingTime": 15.5
  }
}
```

**Use Cases**:
- Successful processing notifications
- System health updates
- Deployment notifications
- Scheduled maintenance alerts

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| environment | Environment name (dev, staging, prod) | string | - | yes |
| kms_key_id | KMS key ID for SNS topic encryption | string | - | yes |
| alert_email | Email address for alert notifications | string | "" | no |

## Outputs

| Name | Description |
|------|-------------|
| failed_processing_topic_arn | ARN of the failed processing SNS topic |
| failed_processing_topic_name | Name of the failed processing SNS topic |
| system_alerts_topic_arn | ARN of the system alerts SNS topic |
| system_alerts_topic_name | Name of the system alerts SNS topic |
| operational_notifications_topic_arn | ARN of the operational notifications SNS topic |
| operational_notifications_topic_name | Name of the operational notifications SNS topic |

## Integration Examples

### Lambda Function Publishing

```python
import boto3
import json

sns_client = boto3.client('sns')
topic_arn = os.environ['FAILED_PROCESSING_SNS_TOPIC']

def notify_failure(document_id, error):
    message = {
        'documentId': document_id,
        'errorType': type(error).__name__,
        'errorMessage': str(error),
        'failedAt': datetime.now().isoformat()
    }
    
    sns_client.publish(
        TopicArn=topic_arn,
        Subject=f'Document Processing Failed: {document_id}',
        Message=json.dumps(message, indent=2)
    )
```

### CloudWatch Alarm Integration

```hcl
resource "aws_cloudwatch_metric_alarm" "high_errors" {
  alarm_name          = "lambda-high-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  
  alarm_actions = [module.notifications.system_alerts_topic_arn]
}
```

### EventBridge Rule Integration

```hcl
resource "aws_cloudwatch_event_rule" "deployment_complete" {
  name        = "deployment-complete"
  description = "Triggered when deployment completes"
  
  event_pattern = jsonencode({
    source      = ["aws.codepipeline"]
    detail-type = ["CodePipeline Pipeline Execution State Change"]
    detail = {
      state = ["SUCCEEDED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "notify_deployment" {
  rule      = aws_cloudwatch_event_rule.deployment_complete.name
  target_id = "SendToSNS"
  arn       = module.notifications.operational_notifications_topic_arn
}
```

## Email Subscription Confirmation

When `alert_email` is provided, AWS SNS sends a confirmation email:

1. **Confirmation Email**: Sent to the specified email address
2. **Confirmation Link**: Click the link to confirm subscription
3. **Active Subscription**: After confirmation, notifications will be delivered

**Important**: Subscriptions remain in "PendingConfirmation" state until confirmed.

### Managing Subscriptions

```bash
# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:region:account:topic-name

# Confirm subscription (if confirmation token available)
aws sns confirm-subscription \
  --topic-arn arn:aws:sns:region:account:topic-name \
  --token CONFIRMATION_TOKEN

# Unsubscribe
aws sns unsubscribe \
  --subscription-arn arn:aws:sns:region:account:topic-name:subscription-id
```

## Additional Subscription Types

### SMS Notifications

```hcl
resource "aws_sns_topic_subscription" "failed_processing_sms" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "sms"
  endpoint  = "+1234567890"
}
```

### Lambda Function Subscription

```hcl
resource "aws_sns_topic_subscription" "failed_processing_lambda" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.notification_handler.arn
}

resource "aws_lambda_permission" "allow_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notification_handler.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = module.notifications.failed_processing_topic_arn
}
```

### SQS Queue Subscription

```hcl
resource "aws_sns_topic_subscription" "failed_processing_sqs" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.notification_queue.arn
}
```

### Slack/Teams Webhook (via Lambda)

```hcl
resource "aws_sns_topic_subscription" "slack_webhook" {
  topic_arn = module.notifications.system_alerts_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}
```

## Security

### Encryption

All SNS topics are encrypted using KMS:
- Messages encrypted at rest
- Messages encrypted in transit (TLS)
- KMS key rotation supported

### IAM Policies

Topics use least-privilege policies:
- Lambda can only publish (not subscribe or delete)
- CloudWatch can only publish to system alerts
- Account owner has full access

### Access Control

```hcl
# Example: Grant specific Lambda function publish access
resource "aws_sns_topic_policy" "custom_access" {
  arn = module.notifications.failed_processing_topic_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSpecificLambda"
        Effect = "Allow"
        Principal = {
          AWS = aws_lambda_function.processor.role
        }
        Action   = "SNS:Publish"
        Resource = module.notifications.failed_processing_topic_arn
      }
    ]
  })
}
```

## Monitoring

### CloudWatch Metrics

SNS automatically publishes metrics:
- `NumberOfMessagesPublished`
- `NumberOfNotificationsDelivered`
- `NumberOfNotificationsFailed`

### Alarms

```hcl
resource "aws_cloudwatch_metric_alarm" "sns_delivery_failures" {
  alarm_name          = "sns-delivery-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NumberOfNotificationsFailed"
  namespace           = "AWS/SNS"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  
  dimensions = {
    TopicName = module.notifications.failed_processing_topic_name
  }
}
```

## Cost Optimization

### Pricing

- **Requests**: $0.50 per 1 million SNS requests
- **Email**: $2.00 per 100,000 emails
- **SMS**: Varies by country
- **Data Transfer**: Standard AWS data transfer rates

### Best Practices

1. **Batch notifications** when possible
2. **Filter subscriptions** to reduce unnecessary notifications
3. **Use SQS** for high-volume, non-urgent notifications
4. **Monitor costs** with AWS Cost Explorer

## Troubleshooting

### Email Not Received

1. Check spam/junk folder
2. Verify email address is correct
3. Check subscription status: `aws sns list-subscriptions-by-topic`
4. Resend confirmation: Delete and recreate subscription

### Messages Not Delivered

1. Check topic policy allows publishing
2. Verify KMS key permissions
3. Check CloudWatch Logs for errors
4. Review SNS metrics for failed deliveries

### Permission Denied

1. Verify IAM role has `sns:Publish` permission
2. Check topic policy allows the principal
3. Verify KMS key policy allows SNS

## Requirements Validation

This module validates the following requirements:

- **Requirement 5.3**: Document processing failures are logged and notifications sent
- **Requirement 14.3**: Failed documents moved to dead-letter queue with notifications
- **Requirement 11.1-11.5**: Audit logging with notifications for critical events

## References

- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [SNS Message Filtering](https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html)
- [SNS Encryption](https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html)
