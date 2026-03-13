# Custom Metrics Implementation Guide

## Overview

This guide explains how to emit custom metrics from Lambda functions to populate the CloudWatch dashboard. All custom metrics use the `ChatbotMetrics` namespace.

## Required Metrics

### 1. Bedrock Token Usage

**Metric Names:**
- `BedrockInputTokens`
- `BedrockOutputTokens`

**Emitted By:** WebSocket message handler Lambda

**When to Emit:** After each Bedrock API call

**TypeScript Example:**
```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

async function emitBedrockTokenMetrics(inputTokens: number, outputTokens: number) {
  await cloudwatch.putMetricData({
    Namespace: 'ChatbotMetrics',
    MetricData: [
      {
        MetricName: 'BedrockInputTokens',
        Value: inputTokens,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      {
        MetricName: 'BedrockOutputTokens',
        Value: outputTokens,
        Unit: 'Count',
        Timestamp: new Date(),
      },
    ],
  });
}
```

### 2. Cache Performance

**Metric Names:**
- `CacheHits`
- `CacheMisses`

**Emitted By:** WebSocket message handler Lambda, RAG system

**When to Emit:** After each cache lookup

**TypeScript Example:**
```typescript
async function emitCacheMetric(hit: boolean) {
  await cloudwatch.putMetricData({
    Namespace: 'ChatbotMetrics',
    MetricData: [
      {
        MetricName: hit ? 'CacheHits' : 'CacheMisses',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      },
    ],
  });
}
```

### 3. Concurrent Connections

**Metric Name:** `ConcurrentConnections`

**Emitted By:** WebSocket connect/disconnect handlers

**When to Emit:** On connection and disconnection events

**TypeScript Example:**
```typescript
async function emitConcurrentConnectionsMetric(connectionCount: number) {
  await cloudwatch.putMetricData({
    Namespace: 'ChatbotMetrics',
    MetricData: [
      {
        MetricName: 'ConcurrentConnections',
        Value: connectionCount,
        Unit: 'Count',
        Timestamp: new Date(),
      },
    ],
  });
}
```

**Implementation Note:** Query DynamoDB connections table to get current count:
```typescript
const result = await dynamodb.scan({
  TableName: process.env.CONNECTIONS_TABLE_NAME,
  Select: 'COUNT',
});
const connectionCount = result.Count || 0;
await emitConcurrentConnectionsMetric(connectionCount);
```

### 4. OpenSearch Query Latency

**Metric Name:** `OpenSearchQueryLatency`

**Emitted By:** Vector store / RAG system Lambda

**When to Emit:** After each OpenSearch query

**TypeScript Example:**
```typescript
async function emitOpenSearchLatencyMetric(latencyMs: number) {
  await cloudwatch.putMetricData({
    Namespace: 'ChatbotMetrics',
    MetricData: [
      {
        MetricName: 'OpenSearchQueryLatency',
        Value: latencyMs,
        Unit: 'Milliseconds',
        Timestamp: new Date(),
        StorageResolution: 1, // High-resolution metric (1-second granularity)
      },
    ],
  });
}

// Usage
const startTime = Date.now();
const results = await opensearchClient.search(query);
const latency = Date.now() - startTime;
await emitOpenSearchLatencyMetric(latency);
```

## Implementation Checklist

### WebSocket Message Handler
- [ ] Emit `BedrockInputTokens` after each Bedrock call
- [ ] Emit `BedrockOutputTokens` after each Bedrock call
- [ ] Emit `CacheHits` or `CacheMisses` after cache lookups
- [ ] Emit `OpenSearchQueryLatency` after vector searches

### WebSocket Connect Handler
- [ ] Emit `ConcurrentConnections` after successful connection
- [ ] Query DynamoDB for current connection count

### WebSocket Disconnect Handler
- [ ] Emit `ConcurrentConnections` after disconnection
- [ ] Query DynamoDB for current connection count

### Document Processor
- [ ] Emit `OpenSearchQueryLatency` when indexing embeddings (optional)

## IAM Permissions

Lambda functions need CloudWatch PutMetricData permission:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "ChatbotMetrics"
        }
      }
    }
  ]
}
```

## Best Practices

### 1. Batch Metric Emissions
Emit multiple metrics in a single API call when possible:

```typescript
await cloudwatch.putMetricData({
  Namespace: 'ChatbotMetrics',
  MetricData: [
    { MetricName: 'BedrockInputTokens', Value: inputTokens, Unit: 'Count' },
    { MetricName: 'BedrockOutputTokens', Value: outputTokens, Unit: 'Count' },
    { MetricName: 'CacheHits', Value: 1, Unit: 'Count' },
  ],
});
```

### 2. Error Handling
Wrap metric emissions in try-catch to prevent failures from affecting core functionality:

```typescript
try {
  await emitMetrics();
} catch (error) {
  console.error('Failed to emit metrics:', error);
  // Continue execution - metrics are non-critical
}
```

### 3. Async Emission
Emit metrics asynchronously to avoid blocking response:

```typescript
// Don't await - fire and forget
emitMetrics().catch(err => console.error('Metric emission failed:', err));
```

### 4. Use Dimensions for Filtering
Add dimensions to segment metrics:

```typescript
{
  MetricName: 'BedrockInputTokens',
  Value: inputTokens,
  Unit: 'Count',
  Dimensions: [
    { Name: 'Environment', Value: process.env.ENVIRONMENT },
    { Name: 'FunctionName', Value: context.functionName },
  ],
}
```

### 5. High-Resolution Metrics
Use 1-second resolution for latency metrics:

```typescript
{
  MetricName: 'OpenSearchQueryLatency',
  Value: latencyMs,
  Unit: 'Milliseconds',
  StorageResolution: 1, // 1-second granularity
}
```

## Testing Metrics

### Local Testing
Use AWS SDK with local credentials:

```typescript
const cloudwatch = new CloudWatch({
  region: 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

### Verify Metrics in Console
1. Navigate to CloudWatch > Metrics
2. Select "ChatbotMetrics" namespace
3. Verify metrics appear within 1-2 minutes

### Query Metrics with AWS CLI
```bash
aws cloudwatch get-metric-statistics \
  --namespace ChatbotMetrics \
  --metric-name BedrockInputTokens \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## Troubleshooting

### Metrics Not Appearing
1. Check IAM permissions for `cloudwatch:PutMetricData`
2. Verify namespace is exactly `ChatbotMetrics` (case-sensitive)
3. Check Lambda logs for metric emission errors
4. Wait 1-2 minutes for metrics to appear in CloudWatch

### Incorrect Metric Values
1. Verify unit is correct (Count, Milliseconds, etc.)
2. Check that values are positive numbers
3. Ensure timestamps are valid
4. Verify metric name spelling

### High CloudWatch Costs
1. Reduce metric emission frequency
2. Use batch API calls
3. Remove unnecessary dimensions
4. Consider using standard resolution (60 seconds) instead of high resolution

## Cost Considerations

CloudWatch custom metrics pricing (as of 2024):
- First 10,000 metrics: $0.30 per metric per month
- Next 240,000 metrics: $0.10 per metric per month
- Over 250,000 metrics: $0.05 per metric per month

**Estimated monthly cost for this implementation:**
- 5 custom metrics × $0.30 = $1.50/month
- Plus API calls: ~$0.01 per 1,000 PutMetricData requests

**Total estimated cost: ~$2-5/month** for moderate usage (10,000 requests/day)

## Related Documentation

- [CloudWatch Dashboard Guide](./DASHBOARD.md)
- [Monitoring Module README](./README.md)
- [AWS CloudWatch Metrics Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/working_with_metrics.html)
