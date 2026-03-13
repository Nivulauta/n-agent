# Notifications Module - Quick Reference

## Deploy

```bash
cd terraform
terraform init
terraform apply
```

## Configure Email Notifications

**terraform.tfvars**:
```hcl
alert_email = "ops-team@example.com"
```

## SNS Topic ARNs

```bash
# Failed Processing
terraform output failed_processing_topic_arn

# System Alerts
terraform output system_alerts_topic_arn

# Operational Notifications
terraform output operational_notifications_topic_arn
```

## Test Notifications

```bash
# Test failed processing
aws sns publish \
  --topic-arn $(terraform output -raw failed_processing_topic_arn) \
  --subject "Test" \
  --message '{"test": true}'

# Test system alert
aws cloudwatch set-alarm-state \
  --alarm-name dev-chatbot-lambda-errors \
  --state-value ALARM \
  --state-reason "Test"
```

## Check Subscriptions

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw failed_processing_topic_arn)
```

## Unsubscribe

```bash
aws sns unsubscribe --subscription-arn SUBSCRIPTION_ARN
```

## Add Slack Webhook

```hcl
resource "aws_sns_topic_subscription" "slack" {
  topic_arn = module.notifications.failed_processing_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}
```

## Add SMS

```hcl
resource "aws_sns_topic_subscription" "sms" {
  topic_arn = module.notifications.system_alerts_topic_arn
  protocol  = "sms"
  endpoint  = "+1234567890"
}
```

## Monitor Metrics

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --dimensions Name=TopicName,Value=dev-chatbot-failed-processing \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Email not received | Check spam, verify email in tfvars |
| Not confirmed | Click confirmation link in email |
| Permission denied | Check IAM role has sns:Publish |
| High costs | Use message filtering, batch notifications |

## Cost

- SNS Requests: $0.50 per 1M
- Email: $2.00 per 100K
- SMS: ~$0.00645 per message (US)

## Documentation

- [README.md](./README.md) - Complete documentation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [SUMMARY.md](./SUMMARY.md) - Implementation summary
