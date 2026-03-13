# Notifications Module - Implementation Summary

## Overview

Created a comprehensive Terraform module for SNS-based notifications in the AWS Claude RAG Chatbot system.

## What Was Created

### Terraform Module Files

```
terraform/modules/notifications/
├── main.tf              - SNS topics and policies
├── variables.tf         - Input variables
├── outputs.tf           - Output values
├── README.md            - Complete documentation
├── DEPLOYMENT.md        - Deployment guide
└── SUMMARY.md           - This file
```

### SNS Topics

1. **Failed Processing Topic**
   - Purpose: Document processing failure notifications
   - Publishers: Lambda functions
   - Validates: Requirements 5.3, 14.3

2. **System Alerts Topic**
   - Purpose: CloudWatch alarms and system alerts
   - Publishers: CloudWatch
   - Integrated with monitoring module

3. **Operational Notifications Topic**
   - Purpose: General operational events
   - Publishers: Lambda, EventBridge, S3

### Features Implemented

✅ **KMS Encryption**: All topics encrypted at rest
✅ **IAM Policies**: Least-privilege access control
✅ **Email Subscriptions**: Optional email notifications
✅ **Multi-Service Support**: Lambda, CloudWatch, S3, EventBridge
✅ **Topic Policies**: Service-specific publish permissions
✅ **Account Isolation**: Source account conditions

## Integration Points

### 1. Document Processor Lambda

**Updated**: `terraform/modules/document-processor/main.tf`

```hcl
environment {
  variables = {
    FAILED_PROCESSING_SNS_TOPIC = var.failed_processing_sns_topic_arn
  }
}
```

**Lambda Code**: Already implemented in `lambda/document-processor/extract-text/index.py`

```python
sns_client.publish(
    TopicArn=FAILED_PROCESSING_SNS_TOPIC,
    Subject=f'Document Processing Failed: {filename}',
    Message=json.dumps(notification_message, indent=2)
)
```

### 2. CloudWatch Alarms

**Updated**: `terraform/modules/monitoring/main.tf`

```hcl
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_actions = [var.system_alerts_topic_arn]
}
```

All three CloudWatch alarms now send notifications to the system alerts topic.

### 3. Main Terraform Configuration

**Updated**: `terraform/main.tf`

```hcl
module "notifications" {
  source = "./modules/notifications"
  
  environment = var.environment
  kms_key_id  = module.security.kms_key_id
  alert_email = var.alert_email
}

module "document_processor" {
  failed_processing_sns_topic_arn = module.notifications.failed_processing_topic_arn
}

module "monitoring" {
  system_alerts_topic_arn = module.notifications.system_alerts_topic_arn
}
```

## Configuration

### Variables Added

**File**: `terraform/variables.tf`

```hcl
variable "alert_email" {
  description = "Email address for SNS alert notifications (optional)"
  type        = string
  default     = ""
}
```

### Example Configuration

**File**: `terraform/terraform.tfvars.example`

```hcl
# Notifications Configuration
alert_email = "ops-team@example.com"  # Optional
```

### Outputs Added

**File**: `terraform/outputs.tf`

```hcl
output "failed_processing_topic_arn" { ... }
output "system_alerts_topic_arn" { ... }
output "operational_notifications_topic_arn" { ... }
```

## Deployment Flow

```
terraform apply
    ↓
Create KMS Key (security module)
    ↓
Create SNS Topics (notifications module)
    ├─ Failed Processing Topic
    ├─ System Alerts Topic
    └─ Operational Notifications Topic
    ↓
Create Topic Policies
    ├─ Allow Lambda to publish
    ├─ Allow CloudWatch to publish
    └─ Allow account owner full access
    ↓
Create Email Subscriptions (if alert_email provided)
    ├─ Failed Processing → Email
    ├─ System Alerts → Email
    └─ Operational Notifications → Email
    ↓
Configure Lambda Functions
    └─ Set FAILED_PROCESSING_SNS_TOPIC env var
    ↓
Configure CloudWatch Alarms
    └─ Set alarm_actions to system_alerts_topic_arn
```

## Message Formats

### Failed Processing Notification

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

### System Alert Notification

```json
{
  "AlarmName": "dev-chatbot-lambda-errors",
  "AlarmDescription": "Lambda error rate exceeded threshold",
  "NewStateValue": "ALARM",
  "NewStateReason": "Threshold Crossed: 10 errors in 5 minutes",
  "StateChangeTime": "2024-01-15T10:30:00.000Z",
  "Region": "us-east-1"
}
```

## Security Features

### 1. Encryption
- All topics encrypted with KMS
- Messages encrypted at rest and in transit
- KMS key rotation supported

### 2. Access Control
- Service-specific IAM policies
- Source account conditions
- Least-privilege permissions

### 3. Audit Trail
- CloudWatch Logs for all publishes
- CloudTrail for API calls
- Subscription audit logs

## Testing

### Test Failed Processing

```bash
aws sns publish \
  --topic-arn $(terraform output -raw failed_processing_topic_arn) \
  --subject "Test Notification" \
  --message '{"test": true}'
```

### Test System Alerts

```bash
aws cloudwatch set-alarm-state \
  --alarm-name dev-chatbot-lambda-errors \
  --state-value ALARM \
  --state-reason "Testing"
```

### Verify Subscriptions

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw failed_processing_topic_arn)
```

## Email Subscription Workflow

1. **Deploy with email configured**
   ```bash
   terraform apply
   ```

2. **Check email for confirmation**
   - Subject: "AWS Notification - Subscription Confirmation"
   - From: no-reply@sns.amazonaws.com

3. **Click confirmation link**
   - Opens browser to confirm
   - Status changes to "Confirmed"

4. **Receive notifications**
   - All future messages delivered to email
   - Unsubscribe link in each email

## Cost Estimates

### SNS Pricing

| Service | Cost | Example Usage | Monthly Cost |
|---------|------|---------------|--------------|
| SNS Requests | $0.50 per 1M | 10,000 failures/month | $0.005 |
| Email Delivery | $2.00 per 100K | 10,000 emails/month | $0.20 |
| **Total** | | | **~$0.21/month** |

### Cost Optimization

- Use message filtering to reduce volume
- Batch notifications when possible
- Use SQS for high-volume, non-urgent notifications

## Monitoring

### Key Metrics

- `NumberOfMessagesPublished` - Messages sent to topic
- `NumberOfNotificationsDelivered` - Successful deliveries
- `NumberOfNotificationsFailed` - Failed deliveries

### Recommended Alarms

```hcl
# Alert on delivery failures
resource "aws_cloudwatch_metric_alarm" "sns_failures" {
  metric_name = "NumberOfNotificationsFailed"
  threshold   = 5
  alarm_actions = [module.notifications.system_alerts_topic_arn]
}
```

## Additional Subscription Types

### Slack Integration

```hcl
resource "aws_sns_topic_subscription" "slack" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}
```

### SMS Notifications

```hcl
resource "aws_sns_topic_subscription" "sms" {
  topic_arn = module.notifications.system_alerts_topic_arn
  protocol  = "sms"
  endpoint  = "+1234567890"
}
```

### SQS Queue

```hcl
resource "aws_sns_topic_subscription" "sqs" {
  topic_arn = module.notifications.operational_notifications_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.notifications.arn
}
```

## Requirements Validation

✅ **Requirement 5.3**: Document processing failures logged and notifications sent
✅ **Requirement 14.3**: Failed documents moved to dead-letter queue with notifications
✅ **Requirement 11.1-11.5**: Audit logging with notifications for critical events

## Next Steps

1. **Deploy Infrastructure**
   ```bash
   cd terraform
   terraform init
   terraform apply
   ```

2. **Configure Email** (Optional)
   ```hcl
   alert_email = "ops-team@example.com"
   ```

3. **Confirm Subscriptions**
   - Check email for confirmation
   - Click confirmation links

4. **Test Notifications**
   ```bash
   aws sns publish --topic-arn TOPIC_ARN --message "Test"
   ```

5. **Add Custom Subscriptions**
   - Slack webhooks
   - PagerDuty integration
   - Custom Lambda handlers

6. **Monitor Usage**
   - Review CloudWatch metrics
   - Set up delivery failure alarms
   - Track costs in Cost Explorer

## Troubleshooting

### Email Not Received
- Check spam folder
- Verify email in terraform.tfvars
- Check subscription status in AWS console

### Messages Not Delivered
- Verify subscription confirmed
- Check topic policy
- Review KMS key permissions

### Permission Denied
- Verify IAM role has sns:Publish
- Check topic policy allows principal
- Verify source account condition

## Documentation

- **README.md**: Complete module documentation
- **DEPLOYMENT.md**: Step-by-step deployment guide
- **SUMMARY.md**: This implementation summary

## References

- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [SNS Best Practices](https://docs.aws.amazon.com/sns/latest/dg/sns-best-practices.html)
- [SNS Pricing](https://aws.amazon.com/sns/pricing/)
