# Notifications Module Deployment Guide

## Quick Start

### 1. Deploy with Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

The notifications module is automatically included in the main deployment.

### 2. Configure Email Notifications (Optional)

Edit `terraform.tfvars`:

```hcl
alert_email = "ops-team@example.com"
```

Then apply:

```bash
terraform apply
```

### 3. Confirm Email Subscription

After deployment, check your email for confirmation messages from AWS SNS. Click the confirmation links to activate subscriptions.

## SNS Topics Created

| Topic | Purpose | Publishers |
|-------|---------|------------|
| `{env}-chatbot-failed-processing` | Document processing failures | Lambda functions |
| `{env}-chatbot-system-alerts` | CloudWatch alarms | CloudWatch |
| `{env}-chatbot-operational-notifications` | General operations | Lambda, EventBridge, S3 |

## Testing

### Test Failed Processing Notifications

```bash
# Publish test message
aws sns publish \
  --topic-arn $(terraform output -raw failed_processing_topic_arn) \
  --subject "Test: Document Processing Failed" \
  --message '{
    "documentId": "test-123",
    "filename": "test.pdf",
    "errorType": "TestError",
    "errorMessage": "This is a test notification"
  }'
```

### Test System Alerts

```bash
# Trigger a test alarm
aws cloudwatch set-alarm-state \
  --alarm-name dev-chatbot-lambda-errors \
  --state-value ALARM \
  --state-reason "Testing alarm notification"
```

### Verify Subscriptions

```bash
# List all subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw failed_processing_topic_arn)
```

## Email Subscription Management

### Confirm Subscription

1. Check email for "AWS Notification - Subscription Confirmation"
2. Click "Confirm subscription" link
3. Verify status changes to "Confirmed"

### Check Subscription Status

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw failed_processing_topic_arn) \
  --query 'Subscriptions[?Protocol==`email`].[Endpoint,SubscriptionArn]' \
  --output table
```

### Unsubscribe

```bash
aws sns unsubscribe \
  --subscription-arn SUBSCRIPTION_ARN
```

Or click "Unsubscribe" link in any notification email.

## Adding Additional Subscriptions

### Add SMS Notifications

Create `terraform/sns_subscriptions.tf`:

```hcl
resource "aws_sns_topic_subscription" "failed_processing_sms" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "sms"
  endpoint  = "+1234567890"
}
```

### Add Slack Webhook

1. Create Lambda function for Slack integration:

```python
import json
import urllib3

def handler(event, context):
    http = urllib3.PoolManager()
    
    message = json.loads(event['Records'][0]['Sns']['Message'])
    
    slack_message = {
        'text': f"🚨 Document Processing Failed",
        'attachments': [{
            'color': 'danger',
            'fields': [
                {'title': 'Document ID', 'value': message.get('documentId'), 'short': True},
                {'title': 'Error', 'value': message.get('errorMessage'), 'short': False}
            ]
        }]
    }
    
    http.request(
        'POST',
        'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
        body=json.dumps(slack_message),
        headers={'Content-Type': 'application/json'}
    )
```

2. Subscribe Lambda to SNS:

```hcl
resource "aws_sns_topic_subscription" "slack_webhook" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}

resource "aws_lambda_permission" "allow_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = module.notifications.failed_processing_topic_arn
}
```

### Add SQS Queue

```hcl
resource "aws_sqs_queue" "notification_queue" {
  name = "${var.environment}-notification-queue"
}

resource "aws_sns_topic_subscription" "sqs" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.notification_queue.arn
}

resource "aws_sqs_queue_policy" "allow_sns" {
  queue_url = aws_sqs_queue.notification_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "sns.amazonaws.com"
      }
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.notification_queue.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = module.notifications.failed_processing_topic_arn
        }
      }
    }]
  })
}
```

## Monitoring

### CloudWatch Metrics

Monitor SNS topic metrics:

```bash
# View published messages
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --dimensions Name=TopicName,Value=dev-chatbot-failed-processing \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### Create Alarm for Failed Deliveries

```hcl
resource "aws_cloudwatch_metric_alarm" "sns_delivery_failures" {
  alarm_name          = "${var.environment}-sns-delivery-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NumberOfNotificationsFailed"
  namespace           = "AWS/SNS"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Alert when SNS notifications fail to deliver"
  
  dimensions = {
    TopicName = module.notifications.failed_processing_topic_name
  }
  
  alarm_actions = [module.notifications.system_alerts_topic_arn]
}
```

## Troubleshooting

### Email Not Received

**Problem**: Confirmation email not received

**Solutions**:
1. Check spam/junk folder
2. Verify email address in `terraform.tfvars`
3. Check AWS SNS console for subscription status
4. Resend confirmation:
   ```bash
   # Delete and recreate subscription
   terraform taint 'module.notifications.aws_sns_topic_subscription.failed_processing_email[0]'
   terraform apply
   ```

### Messages Not Delivered

**Problem**: Subscribed but not receiving messages

**Solutions**:
1. Verify subscription is confirmed:
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn TOPIC_ARN \
     --query 'Subscriptions[?Protocol==`email`].SubscriptionArn'
   ```
2. Check SNS topic policy allows publishing
3. Verify KMS key permissions
4. Check CloudWatch Logs for Lambda errors (if using Lambda subscription)

### Permission Denied

**Problem**: Lambda cannot publish to SNS

**Solutions**:
1. Verify Lambda IAM role has `sns:Publish` permission
2. Check SNS topic policy allows Lambda service
3. Verify source account condition matches

### High Costs

**Problem**: Unexpected SNS charges

**Solutions**:
1. Review number of messages published:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/SNS \
     --metric-name NumberOfMessagesPublished \
     --dimensions Name=TopicName,Value=TOPIC_NAME \
     --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 86400 \
     --statistics Sum
   ```
2. Implement message filtering to reduce unnecessary notifications
3. Use SQS for high-volume, non-urgent notifications
4. Batch notifications when possible

## Security Best Practices

### 1. Encrypt Topics

All topics use KMS encryption by default. Ensure KMS key policy allows SNS:

```json
{
  "Sid": "Allow SNS to use the key",
  "Effect": "Allow",
  "Principal": {
    "Service": "sns.amazonaws.com"
  },
  "Action": [
    "kms:Decrypt",
    "kms:GenerateDataKey"
  ],
  "Resource": "*"
}
```

### 2. Restrict Publishers

Topic policies restrict publishing to specific services. Review and tighten as needed:

```hcl
# Only allow specific Lambda function
resource "aws_sns_topic_policy" "custom" {
  arn = module.notifications.failed_processing_topic_arn

  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Principal = {
        AWS = aws_iam_role.document_processor.arn
      }
      Action   = "SNS:Publish"
      Resource = module.notifications.failed_processing_topic_arn
    }]
  })
}
```

### 3. Monitor Access

Enable CloudTrail logging for SNS API calls:

```hcl
resource "aws_cloudtrail" "sns_audit" {
  name           = "${var.environment}-sns-audit"
  s3_bucket_name = aws_s3_bucket.cloudtrail.id
  
  event_selector {
    read_write_type           = "All"
    include_management_events = true
    
    data_resource {
      type   = "AWS::SNS::Topic"
      values = ["arn:aws:sns:*:*:*"]
    }
  }
}
```

### 4. Validate Subscriptions

Regularly audit subscriptions:

```bash
# List all subscriptions across all topics
aws sns list-subscriptions \
  --query 'Subscriptions[?starts_with(TopicArn, `arn:aws:sns:us-east-1:ACCOUNT_ID:dev-chatbot`)]' \
  --output table
```

## Cost Optimization

### Pricing

- **SNS Requests**: $0.50 per 1 million requests
- **Email**: $2.00 per 100,000 emails
- **SMS**: Varies by country ($0.00645 per SMS in US)
- **Data Transfer**: Standard AWS rates

### Optimization Tips

1. **Use Message Filtering**: Reduce unnecessary notifications
   ```hcl
   resource "aws_sns_topic_subscription" "filtered" {
     topic_arn = module.notifications.failed_processing_topic_arn
     protocol  = "email"
     endpoint  = "ops@example.com"
     
     filter_policy = jsonencode({
       errorType = ["CriticalError", "SecurityError"]
     })
   }
   ```

2. **Batch Notifications**: Combine multiple events
3. **Use SQS for High Volume**: Process in batches
4. **Set Delivery Policies**: Configure retry behavior

## Cleanup

### Remove Email Subscriptions

```bash
# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn TOPIC_ARN

# Unsubscribe
aws sns unsubscribe --subscription-arn SUBSCRIPTION_ARN
```

### Destroy Infrastructure

```bash
terraform destroy
```

**Note**: Email subscriptions must be manually unsubscribed before destroying.

## Next Steps

1. Configure email notifications in `terraform.tfvars`
2. Deploy with `terraform apply`
3. Confirm email subscriptions
4. Test notifications
5. Add additional subscriptions (Slack, PagerDuty, etc.)
6. Set up monitoring and alarms
7. Document runbooks for common scenarios
