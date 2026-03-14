# Operational Runbook: AWS Claude RAG Chatbot

This runbook covers monitoring, alerting, incident investigation, failed document handling, and scaling procedures for the chatbot system.

Replace `${ENV}` with your environment name (e.g., `dev`, `staging`, `prod`) and `${REGION}` with your AWS region (e.g., `us-east-2`).

---

## 1. Monitoring and Alerting Overview

### CloudWatch Dashboard

Open the system dashboard:

```bash
aws cloudwatch get-dashboard \
  --dashboard-name "${ENV}-chatbot-system-monitoring" \
  --region ${REGION}
```

Or navigate in the AWS Console:
**CloudWatch → Dashboards → `${ENV}-chatbot-system-monitoring`**

The dashboard displays:

| Widget | Metrics |
|--------|---------|
| Request Rate | REST API requests, WebSocket messages |
| Error Rate | 5XX errors, 4XX errors, Lambda errors |
| Latency Percentiles | p50, p95, p99 Lambda duration (2s SLA threshold) |
| Bedrock Token Usage | Input/output tokens per period |
| Bedrock Cost Estimates | Hourly USD estimate based on token usage |
| Cache Hit Rate | Percentage of cache hits (30% target) |
| Concurrent Users | Active WebSocket connections, Lambda concurrent executions |
| OpenSearch Query Latency | Average, p95, p99 search latency (200ms target) |
| Lambda Invocations | Per-function invocation counts |
| DynamoDB Capacity | Read/write capacity unit consumption |
| S3 Storage | Bucket size and object count |
| ElastiCache Redis | Cache hits/misses, CPU utilization |

### CloudWatch Alarms

All alarms send notifications to the SNS topic `${ENV}-chatbot-system-alerts`.

| Alarm Name | Condition | Namespace | Period |
|------------|-----------|-----------|--------|
| `${ENV}-chatbot-lambda-errors` | Errors > 10 | AWS/Lambda | 5 min (2 eval periods) |
| `${ENV}-chatbot-api-gateway-5xx` | 5XX errors > 10 | AWS/ApiGateway | 5 min (2 eval periods) |
| `${ENV}-chatbot-high-latency` | WebSocket handler duration > 2000ms | AWS/Lambda | 5 min (2 eval periods) |
| `${ENV}-chatbot-response-time-exceeded` | query_latency > 2000ms | ChatbotMetrics | 1 min (3 eval periods) |
| `${ENV}-chatbot-high-error-rate` | Lambda error rate > 5% | AWS/Lambda (math) | 5 min (2 eval periods) |
| `${ENV}-chatbot-bedrock-throttling` | BedrockThrottlingErrors > 5 | ChatbotMetrics | 1 min (1 eval period) |
| `${ENV}-chatbot-api-error-rate` | API Gateway error rate > 5% | AWS/ApiGateway (math) | 5 min (2 eval periods) |

### SNS Topics

| Topic | Purpose |
|-------|---------|
| `${ENV}-chatbot-system-alerts` | CloudWatch alarm notifications |
| `${ENV}-chatbot-failed-processing` | Document processing failure alerts |
| `${ENV}-chatbot-operational-notifications` | General operational events |

Check subscription status:

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn "arn:aws:sns:${REGION}:$(aws sts get-caller-identity --query Account --output text):${ENV}-chatbot-system-alerts" \
  --region ${REGION}
```

> Email subscriptions require manual confirmation. Verify all subscribers have confirmed.

### Audit Log Groups

| Log Group | Retention | Purpose |
|-----------|-----------|---------|
| `/aws/lambda/chatbot/audit/user-actions` | 365 days | Login, logout, queries, uploads, deletes |
| `/aws/lambda/chatbot/audit/api-calls` | 365 days | Bedrock, OpenSearch, S3 API calls |
| `/aws/lambda/chatbot/audit/document-operations` | 365 days | Upload, delete, process operations |

---

## 2. Investigating CloudWatch Alarms

### General: Check Alarm State

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix "${ENV}-chatbot" \
  --region ${REGION} \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
  --output table
```

View alarm history:

```bash
aws cloudwatch describe-alarm-history \
  --alarm-name "${ENV}-chatbot-lambda-errors" \
  --history-item-type StateUpdate \
  --region ${REGION} \
  --max-items 10
```

---

### 2.1 Lambda Errors (`${ENV}-chatbot-lambda-errors`)

**Trigger:** More than 10 Lambda errors in 5 minutes across chatbot functions.

**Step 1 — Identify which function is failing:**

```bash
aws cloudwatch get-metric-data \
  --metric-data-queries '[
    {"Id":"errors","MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Errors","Dimensions":[{"Name":"FunctionName","Value":"'${ENV}'-websocket-message"}]},"Period":300,"Stat":"Sum"}},
    {"Id":"docproc","MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Errors","Dimensions":[{"Name":"FunctionName","Value":"'${ENV}'-chatbot-document-processor"}]},"Period":300,"Stat":"Sum"}},
    {"Id":"auth","MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Errors","Dimensions":[{"Name":"FunctionName","Value":"'${ENV}'-auth-login"}]},"Period":300,"Stat":"Sum"}}
  ]' \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --region ${REGION}
```

**Step 2 — Check recent error logs (example for WebSocket handler):**

```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/${ENV}-websocket-message" \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '30 minutes ago' +%s)000 \
  --region ${REGION} \
  --limit 20
```

**Step 3 — Use Logs Insights for error breakdown:**

```bash
aws logs start-query \
  --log-group-name "/aws/lambda/${ENV}-websocket-message" \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, @message
    | filter @message like /ERROR/
    | stats count(*) as errorCount by @message
    | sort errorCount desc
    | limit 10
  ' \
  --region ${REGION}
```

Retrieve query results (use the queryId from the previous command):

```bash
aws logs get-query-results --query-id "<QUERY_ID>" --region ${REGION}
```

**Common causes:**
- Bedrock API throttling → check `${ENV}-chatbot-bedrock-throttling` alarm
- OpenSearch connection timeout → check VPC/security group config
- DynamoDB capacity exceeded → check DynamoDB consumed capacity metrics
- Out of memory → check Lambda memory configuration

---

### 2.2 API Gateway 5XX Errors (`${ENV}-chatbot-api-gateway-5xx`)

**Trigger:** More than 10 5XX errors in 5 minutes.

**Step 1 — Check API Gateway logs:**

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apigateway/${ENV}-chatbot-api" \
  --filter-pattern "5" \
  --start-time $(date -u -d '30 minutes ago' +%s)000 \
  --region ${REGION} \
  --limit 20
```

**Step 2 — Logs Insights query for 5XX patterns:**

```bash
aws logs start-query \
  --log-group-name "/aws/apigateway/${ENV}-chatbot-api" \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, httpMethod, resourcePath, status, responseLength
    | filter status >= 500
    | stats count(*) as count by resourcePath, status
    | sort count desc
  ' \
  --region ${REGION}
```

**Common causes:**
- Lambda function timeout (30s for API handlers)
- Lambda concurrency limit reached
- Backend service unavailable (OpenSearch, DynamoDB)
- Lambda authorizer failures

---

### 2.3 High Latency (`${ENV}-chatbot-high-latency`)

**Trigger:** WebSocket message handler average duration exceeds 2000ms over 2 consecutive 5-minute periods.

**Step 1 — Check latency distribution:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=${ENV}-websocket-message \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average Maximum p99 \
  --region ${REGION}
```

**Step 2 — Identify slow operations with Logs Insights:**

```bash
aws logs start-query \
  --log-group-name "/aws/lambda/${ENV}-websocket-message" \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, @duration, @message
    | filter @duration > 2000
    | sort @duration desc
    | limit 20
  ' \
  --region ${REGION}
```

**Common causes:**
- OpenSearch query latency spike → check OpenSearch cluster health
- Bedrock response time increase → check Bedrock throttling
- Cold starts → consider provisioned concurrency
- Cache misses → check ElastiCache Redis metrics

---

### 2.4 Response Time Exceeded (`${ENV}-chatbot-response-time-exceeded`)

**Trigger:** Custom `query_latency` metric in ChatbotMetrics namespace exceeds 2000ms average over 3 consecutive 1-minute periods.

**Step 1 — Check custom query latency metric:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace ChatbotMetrics \
  --metric-name query_latency \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average Maximum p95 \
  --region ${REGION}
```

**Step 2 — Check OpenSearch query latency:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace ChatbotMetrics \
  --metric-name OpenSearchQueryLatency \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average Maximum p95 \
  --region ${REGION}
```

**Step 3 — Check cache hit rate (low cache hits increase latency):**

```bash
aws cloudwatch get-metric-statistics \
  --namespace ChatbotMetrics \
  --metric-name CacheHits \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ${REGION}
```

**Resolution steps:**
1. If OpenSearch latency is high → see Section 4 (scaling OpenSearch)
2. If cache hit rate is low → check Redis connectivity and eviction metrics
3. If Bedrock is slow → check throttling alarm and consider request batching

---

### 2.5 High Error Rate (`${ENV}-chatbot-high-error-rate`)

**Trigger:** Lambda error rate exceeds 5% over 2 consecutive 5-minute periods.

**Step 1 — Get error vs invocation counts:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ${REGION}

aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ${REGION}
```

**Step 2 — Check for deployment-related issues:**

```bash
# Check recent Lambda deployments
aws lambda get-function \
  --function-name "${ENV}-websocket-message" \
  --query 'Configuration.{LastModified:LastModified,CodeSize:CodeSize,Runtime:Runtime}' \
  --region ${REGION}
```

**Resolution:** If error rate spiked after a deployment, consider rolling back the Lambda function to the previous version.

---

### 2.6 Bedrock Throttling (`${ENV}-chatbot-bedrock-throttling`)

**Trigger:** More than 5 BedrockThrottlingErrors in 1 minute.

**Step 1 — Check throttling metric:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace ChatbotMetrics \
  --metric-name BedrockThrottlingErrors \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum \
  --region ${REGION}
```

**Step 2 — Check concurrent Bedrock usage:**

```bash
aws logs start-query \
  --log-group-name "/aws/lambda/${ENV}-websocket-message" \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, @message
    | filter @message like /ThrottlingException/ or @message like /TooManyRequestsException/
    | stats count(*) as throttleCount by bin(5m)
    | sort @timestamp desc
  ' \
  --region ${REGION}
```

**Resolution steps:**
1. The system has built-in retry with exponential backoff (3 attempts: 1s, 2s, 4s)
2. If sustained throttling, request a Bedrock quota increase via AWS Service Quotas
3. Improve cache hit rate to reduce Bedrock calls (check Redis connectivity)
4. Consider reducing `max_tokens` or batching requests during peak hours

---

### 2.7 API Gateway Error Rate (`${ENV}-chatbot-api-error-rate`)

**Trigger:** Combined 4XX + 5XX error rate exceeds 5% of total API requests over 2 consecutive 5-minute periods.

**Step 1 — Break down errors by type:**

```bash
aws logs start-query \
  --log-group-name "/aws/apigateway/${ENV}-chatbot-api" \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, status, httpMethod, resourcePath
    | filter status >= 400
    | stats count(*) as count by status, httpMethod, resourcePath
    | sort count desc
    | limit 20
  ' \
  --region ${REGION}
```

**Common causes:**
- High 401/403 → authentication issues, expired tokens
- High 429 → rate limiting kicking in (expected under load)
- High 500/502 → Lambda errors (cross-reference with Lambda error alarm)
- High 504 → Lambda timeout

---

## 3. Handling Failed Document Processing

When a document fails processing, the system:
1. Moves the PDF to the S3 `failed/` folder with an `error.json` file
2. Updates the DynamoDB `DocumentMetadata` table with `processingStatus=failed`
3. Publishes a notification to the `${ENV}-chatbot-failed-processing` SNS topic

### 3.1 Check for Failed Documents

**List failed documents in S3:**

```bash
BUCKET_NAME="${ENV}-chatbot-documents"  # adjust to your actual bucket name

aws s3 ls "s3://${BUCKET_NAME}/failed/" --recursive --region ${REGION}
```

**Read the error details for a specific document:**

```bash
aws s3 cp "s3://${BUCKET_NAME}/failed/<DOCUMENT_ID>/error.json" - --region ${REGION} | python3 -m json.tool
```

**Query DynamoDB for failed documents:**

```bash
aws dynamodb scan \
  --table-name "${ENV}-DocumentMetadata" \
  --filter-expression "processingStatus = :status" \
  --expression-attribute-values '{":status":{"S":"failed"}}' \
  --projection-expression "documentId, filename, uploadedBy, uploadedAt, errorMessage" \
  --region ${REGION}
```

### 3.2 Check Document Processor Logs

```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/${ENV}-chatbot-document-processor" \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '24 hours ago' +%s)000 \
  --region ${REGION} \
  --limit 20
```

**Logs Insights — recent processing failures:**

```bash
aws logs start-query \
  --log-group-name "/aws/lambda/${ENV}-chatbot-document-processor" \
  --start-time $(date -u -d '24 hours ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string '
    fields @timestamp, @message
    | filter @message like /ERROR/ or @message like /failed/
    | sort @timestamp desc
    | limit 20
  ' \
  --region ${REGION}
```

### 3.3 Reprocess a Failed Document

**Step 1 — Copy the document back to the uploads/ folder to re-trigger processing:**

```bash
DOCUMENT_ID="<DOCUMENT_ID>"
FILENAME="<FILENAME>.pdf"

# Copy from failed/ back to uploads/
aws s3 cp \
  "s3://${BUCKET_NAME}/failed/${DOCUMENT_ID}/${FILENAME}" \
  "s3://${BUCKET_NAME}/uploads/${DOCUMENT_ID}/${FILENAME}" \
  --region ${REGION}
```

This triggers the S3 event notification, which invokes the document processor Lambda automatically.

**Step 2 — Reset the DynamoDB status to `pending`:**

```bash
aws dynamodb update-item \
  --table-name "${ENV}-DocumentMetadata" \
  --key '{"PK":{"S":"DOC#'${DOCUMENT_ID}'"},"SK":{"S":"METADATA"}}' \
  --update-expression "SET processingStatus = :status REMOVE errorMessage" \
  --expression-attribute-values '{":status":{"S":"pending"}}' \
  --region ${REGION}
```

**Step 3 — Monitor reprocessing:**

```bash
# Watch the document processor logs
aws logs tail "/aws/lambda/${ENV}-chatbot-document-processor" \
  --follow --since 1m --region ${REGION}
```

**Step 4 — Verify completion:**

```bash
aws dynamodb get-item \
  --table-name "${ENV}-DocumentMetadata" \
  --key '{"PK":{"S":"DOC#'${DOCUMENT_ID}'"},"SK":{"S":"METADATA"}}' \
  --projection-expression "processingStatus, chunkCount" \
  --region ${REGION}
```

### 3.4 Common Document Processing Failures

| Error | Cause | Fix |
|-------|-------|-----|
| Timeout (300s exceeded) | PDF too large or complex | Split the PDF into smaller files |
| Memory exceeded (3008MB) | Very large PDF with images | Reduce PDF file size before upload |
| Text extraction failed | Corrupted or image-only PDF | Use OCR preprocessing or re-scan the document |
| Embedding generation failed | Bedrock Titan throttling | Wait and reprocess; request quota increase if recurring |
| OpenSearch indexing failed | Cluster at capacity | Check OpenSearch cluster health and scale if needed |

---

## 4. Scaling Resources for Increased Load

### 4.1 Lambda Concurrency

**Check current concurrency usage:**

```bash
aws lambda get-function-concurrency \
  --function-name "${ENV}-websocket-message" \
  --region ${REGION}

aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Maximum \
  --region ${REGION}
```

**Increase reserved concurrency (update in Terraform and apply):**

In `terraform/modules/lambda/main.tf` (or the relevant module), adjust:

```hcl
reserved_concurrent_executions = 200  # increase from default
```

**Quick manual override (temporary, will be overwritten by next Terraform apply):**

```bash
aws lambda put-function-concurrency \
  --function-name "${ENV}-websocket-message" \
  --reserved-concurrent-executions 200 \
  --region ${REGION}
```

**Add provisioned concurrency to reduce cold starts:**

```bash
# First publish a version
VERSION=$(aws lambda publish-version \
  --function-name "${ENV}-websocket-message" \
  --region ${REGION} \
  --query 'Version' --output text)

aws lambda put-provisioned-concurrency-config \
  --function-name "${ENV}-websocket-message" \
  --qualifier ${VERSION} \
  --provisioned-concurrent-executions 10 \
  --region ${REGION}
```

### 4.2 OpenSearch Cluster Sizing

**Check cluster health:**

```bash
# Get OpenSearch domain status
aws opensearch describe-domain \
  --domain-name "${ENV}-chatbot-opensearch" \
  --region ${REGION} \
  --query 'DomainStatus.{Status:Processing,InstanceType:ClusterConfig.InstanceType,InstanceCount:ClusterConfig.InstanceCount,StorageType:EBSOptions.VolumeType,StorageSize:EBSOptions.VolumeSize}'
```

**Check cluster metrics:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ES \
  --metric-name CPUUtilization \
  --dimensions Name=DomainName,Value=${ENV}-chatbot-opensearch Name=ClientId,Value=$(aws sts get-caller-identity --query Account --output text) \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average Maximum \
  --region ${REGION}
```

**Scaling recommendations:**

| Load Level | Instance Type | Node Count | EBS Storage |
|------------|--------------|------------|-------------|
| Low (< 100 docs) | t3.medium.search | 3 | 100 GB |
| Medium (100–1000 docs) | m6g.large.search | 3 | 250 GB |
| High (1000–10000 docs) | m6g.xlarge.search | 3 | 500 GB |
| Very High (10000+ docs) | r6g.xlarge.search | 5 | 1 TB |

Update in `terraform/modules/opensearch/main.tf` and apply:

```hcl
instance_type  = "m6g.large.search"
instance_count = 3
volume_size    = 250
```

### 4.3 ElastiCache Redis

**Check Redis metrics:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CPUUtilization \
  --dimensions Name=CacheClusterId,Value=${ENV}-chatbot-redis \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average Maximum \
  --region ${REGION}

aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name DatabaseMemoryUsagePercentage \
  --dimensions Name=CacheClusterId,Value=${ENV}-chatbot-redis \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average Maximum \
  --region ${REGION}
```

**Scaling options:**
- If memory usage > 80%: upgrade node type (e.g., `cache.t3.medium` → `cache.r6g.large`)
- If evictions are high: increase `maxmemory` or upgrade node type
- Update in `terraform/modules/elasticache/main.tf` and apply

### 4.4 DynamoDB

DynamoDB tables use on-demand capacity by default, which auto-scales. If you see throttling:

**Check for throttled requests:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=${ENV}-Sessions \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ${REGION}
```

**Switch to provisioned capacity if needed (for predictable workloads):**

```bash
aws dynamodb update-table \
  --table-name "${ENV}-Sessions" \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=100,WriteCapacityUnits=50 \
  --region ${REGION}
```

> Prefer managing DynamoDB capacity through Terraform for consistency.

### 4.5 API Gateway

**Check current throttle settings:**

```bash
aws apigateway get-stage \
  --rest-api-id "<REST_API_ID>" \
  --stage-name "${ENV}" \
  --query 'methodSettings."*/*".{ThrottleBurst:throttlingBurstLimit,ThrottleRate:throttlingRateLimit}' \
  --region ${REGION}
```

**Current defaults:** burst=100, rate=50 req/sec. To increase, update in Terraform and apply, or temporarily:

```bash
aws apigateway update-stage \
  --rest-api-id "<REST_API_ID>" \
  --stage-name "${ENV}" \
  --patch-operations op=replace,path=/~1*~1*/throttling/burstLimit,value=200 \
  --region ${REGION}
```

### 4.6 Bedrock Quotas

**Check current Bedrock service quotas:**

```bash
aws service-quotas get-service-quota \
  --service-code bedrock \
  --quota-code "<QUOTA_CODE>" \
  --region ${REGION}
```

**Request a quota increase:**

```bash
aws service-quotas request-service-quota-increase \
  --service-code bedrock \
  --quota-code "<QUOTA_CODE>" \
  --desired-value 100 \
  --region ${REGION}
```

> Check the [AWS Service Quotas console](https://console.aws.amazon.com/servicequotas/) for the specific quota codes for Claude model invocations and Titan Embeddings.
