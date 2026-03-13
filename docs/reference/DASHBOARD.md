# CloudWatch Dashboard Guide

## Overview

The CloudWatch dashboard provides comprehensive monitoring for the AWS Claude RAG Agent system. It displays key performance indicators, cost metrics, and system health information in a single view.

## Dashboard Sections

### 1. Request Rate
- **Metrics**: REST API requests and WebSocket messages
- **Purpose**: Monitor overall system usage and traffic patterns
- **Update Frequency**: 5 minutes

### 2. Error Rate
- **Metrics**: 5XX errors, 4XX errors, Lambda errors
- **Purpose**: Track system reliability and identify issues
- **Alert Threshold**: Alarms trigger when errors exceed 10 in 5 minutes

### 3. Response Latency Percentiles
- **Metrics**: p50, p95, p99 latency
- **Purpose**: Monitor response times and ensure SLA compliance
- **SLA Target**: 2 seconds (shown as red line)
- **Update Frequency**: 5 minutes

### 4. Bedrock Token Usage
- **Metrics**: Input tokens and output tokens
- **Purpose**: Track Claude API usage for cost management
- **Update Frequency**: 5 minutes

### 5. Bedrock Cost Estimates
- **Calculation**: (Input tokens × $0.00025 + Output tokens × $0.00125) / 1000
- **Purpose**: Real-time cost tracking for Bedrock API usage
- **Update Frequency**: 1 hour
- **Note**: Based on Claude Haiku 4.5 pricing

### 6. Cache Hit Rate
- **Calculation**: (Cache hits / (Cache hits + Cache misses)) × 100
- **Purpose**: Monitor caching effectiveness
- **Target**: 30% hit rate (shown as green line)
- **Update Frequency**: 5 minutes

### 7. Concurrent User Count
- **Metrics**: Active WebSocket connections and Lambda concurrent executions
- **Purpose**: Monitor system load and scaling
- **Target**: Support 100 concurrent users (shown as green line)
- **Update Frequency**: 1 minute

### 8. OpenSearch Query Latency
- **Metrics**: Average, p95, p99 latency
- **Purpose**: Monitor vector search performance
- **Target**: 200ms (shown as red line)
- **Update Frequency**: 5 minutes

### 9. Lambda Invocations by Function
- **Metrics**: Invocations for WebSocket handler, document processor, and auth functions
- **Purpose**: Track function usage patterns
- **Update Frequency**: 5 minutes

### 10. DynamoDB Capacity Usage
- **Metrics**: Read and write capacity units consumed
- **Purpose**: Monitor database usage and optimize capacity
- **Update Frequency**: 5 minutes

### 11. S3 Document Storage
- **Metrics**: Storage size and object count
- **Purpose**: Track document storage growth
- **Update Frequency**: 24 hours

### 12. ElastiCache Redis Performance
- **Metrics**: Cache hits, cache misses, CPU utilization
- **Purpose**: Monitor Redis cache performance
- **Update Frequency**: 5 minutes

## Custom Metrics

The dashboard uses custom metrics in the `ChatbotMetrics` namespace. These metrics are emitted by Lambda functions:

- `BedrockInputTokens`: Total input tokens sent to Bedrock
- `BedrockOutputTokens`: Total output tokens received from Bedrock
- `CacheHits`: Number of cache hits
- `CacheMisses`: Number of cache misses
- `ConcurrentConnections`: Number of active WebSocket connections
- `OpenSearchQueryLatency`: Vector search query latency in milliseconds

## Accessing the Dashboard

### Via AWS Console
1. Navigate to CloudWatch in the AWS Console
2. Select "Dashboards" from the left menu
3. Find the dashboard named: `{environment}-chatbot-system-monitoring`
4. Click to view

### Via Terraform Output
```bash
terraform output cloudwatch_dashboard_name
```

### Direct URL
```
https://console.aws.amazon.com/cloudwatch/home?region={region}#dashboards:name={environment}-chatbot-system-monitoring
```

## Interpreting Metrics

### Healthy System Indicators
- Error rate < 5%
- p95 latency < 2 seconds
- Cache hit rate > 30%
- OpenSearch query latency < 200ms
- No active alarms

### Warning Signs
- Increasing error rate
- Latency approaching 2-second threshold
- Cache hit rate dropping below 30%
- OpenSearch latency exceeding 200ms
- Rising Bedrock costs without corresponding user growth

### Critical Issues
- Error rate > 10%
- p99 latency > 2 seconds
- Multiple active alarms
- Lambda throttling errors
- DynamoDB throttling

## Cost Optimization

Monitor these metrics to optimize costs:

1. **Bedrock Token Usage**: High token usage indicates opportunities for:
   - Better prompt engineering
   - Increased caching
   - Query optimization

2. **Cache Hit Rate**: Low hit rate suggests:
   - Adjusting cache TTL values
   - Increasing cache size
   - Reviewing query patterns

3. **Lambda Duration**: High duration indicates:
   - Code optimization opportunities
   - Memory allocation adjustments
   - Potential for provisioned concurrency

4. **DynamoDB Capacity**: Consistent high usage suggests:
   - Switching to on-demand pricing
   - Optimizing query patterns
   - Adding indexes

## Troubleshooting

### Dashboard Not Showing Data
1. Verify Lambda functions are emitting custom metrics
2. Check that the environment variable matches
3. Ensure CloudWatch agent is configured correctly
4. Verify IAM permissions for metric publishing

### Missing Metrics
1. Check Lambda function logs for metric emission errors
2. Verify metric namespace is `ChatbotMetrics`
3. Ensure metric dimensions are correct
4. Check CloudWatch Logs for errors

### Incorrect Cost Calculations
1. Verify Bedrock pricing in the calculation expression
2. Update pricing if AWS changes rates
3. Check that token metrics are being emitted correctly

## Customization

To modify the dashboard:

1. Edit `terraform/modules/monitoring/main.tf`
2. Update the `aws_cloudwatch_dashboard.system_monitoring` resource
3. Modify widget configurations in the `dashboard_body` JSON
4. Run `terraform apply` to update

### Adding New Widgets

```hcl
{
  type = "metric"
  properties = {
    metrics = [
      ["Namespace", "MetricName", { stat = "Average", label = "Display Name" }]
    ]
    period = 300
    region = var.aws_region
    title  = "Widget Title"
  }
  width  = 12
  height = 6
  x      = 0
  y      = 36
}
```

## Related Resources

- [CloudWatch Alarms](./AUDIT_LOGS.md)
- [Monitoring Module](./README.md)
- [System Requirements](../../requirements.md)
- [Design Document](../../design.md)

## Support

For issues or questions:
1. Check CloudWatch Logs for errors
2. Review Lambda function logs
3. Verify metric emission in application code
4. Contact the DevOps team
