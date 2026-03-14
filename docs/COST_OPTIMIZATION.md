# Cost Optimization Guide

This guide covers cost optimization strategies for the AWS RAG Chatbot system. It includes cache tuning, Lambda right-sizing, OpenSearch scaling, and expected monthly costs at various usage levels.

All recommendations include specific Terraform variable changes you can apply immediately.

## Table of Contents

1. [System Cost Breakdown](#system-cost-breakdown)
2. [Cache Configuration and Tuning](#cache-configuration-and-tuning)
3. [Lambda Memory and Timeout Optimization](#lambda-memory-and-timeout-optimization)
4. [OpenSearch Instance Sizing](#opensearch-instance-sizing)
5. [Expected Monthly Costs](#expected-monthly-costs)
6. [Additional Optimization Strategies](#additional-optimization-strategies)

---

## System Cost Breakdown

### Service-by-Service Monthly Costs (us-east-2, Dev Defaults)

| Service | Component | Default Config | Est. Monthly Cost |
|---------|-----------|---------------|-------------------|
| ElastiCache | Redis cache | 1x cache.t3.micro | ~$12.50 |
| OpenSearch | Vector store | 1x t3.small.search, 100GB gp3 | ~$36 |
| Lambda | 10 functions | 1024-3008MB, on-demand | ~$5-20 |
| DynamoDB | 4 tables | On-demand capacity | ~$5-15 |
| NAT Gateway | Outbound traffic | 1 gateway + data transfer | ~$32+ |
| API Gateway | REST + WebSocket | Per-request pricing | ~$3-10 |
| S3 | Documents + frontend | Standard storage + requests | ~$1-5 |
| CloudFront | CDN | Standard distribution | ~$1-5 |
| Bedrock | Claude Haiku 4.5 | Per-token pricing | ~$5-50 |
| Bedrock | Titan Embeddings v2 | Per-token pricing | ~$1-10 |
| CloudWatch | Logs + metrics | 365-day retention | ~$5-15 |
| KMS | Encryption keys | Per-key + API calls | ~$1-3 |
| **Total** | | **Dev defaults** | **~$110-180/mo** |

---

## Cache Configuration and Tuning

The cache layer (ElastiCache Redis) is the primary cost optimization mechanism. It reduces calls to Bedrock and OpenSearch, which are the most expensive per-request services.

### Current Configuration

```hcl
# terraform/terraform.tfvars
redis_node_type                    = "cache.t3.micro"   # ~$12.50/mo
redis_num_cache_nodes              = 1                  # Single node, no HA
redis_snapshot_retention_limit     = 0                  # Backups disabled
redis_enable_encryption_at_rest    = false
redis_enable_encryption_in_transit = false
```

### Cache TTL Settings

| Cache Type | TTL | Rationale |
|-----------|-----|-----------|
| Bedrock responses | 3600s (1 hour) | Identical queries return cached LLM responses, avoiding ~$0.001/query Bedrock cost |
| OpenSearch results | 900s (15 minutes) | Same embedding queries skip vector search, reducing OpenSearch load |

Cache keys use SHA-256 hashed queries. Eviction policy is `allkeys-lru` (least recently used).

### Tuning Recommendations

**Increase TTLs for lower-traffic environments:**

If your query patterns are repetitive (e.g., internal knowledge base), increase TTLs to improve hit rate:

```typescript
// lambda/shared/cache-utils.ts
const BEDROCK_CACHE_TTL = 7200;    // 2 hours (from 3600)
const SEARCH_CACHE_TTL = 1800;     // 30 minutes (from 900)
```

**Monitor cache hit rate:**

Target: ≥30% hit rate (Requirement 12.5). Check via CloudWatch metrics:
- `CacheHits` / (`CacheHits` + `CacheMisses`) in the ChatbotMetrics namespace
- ElastiCache `CacheHitRate` metric

If hit rate is below 20%, the cache may not be cost-effective — consider disabling it entirely to save ~$12.50/mo.

**Sizing by environment:**

| Environment | Node Type | Nodes | Memory | Monthly Cost |
|------------|-----------|-------|--------|-------------|
| Dev/Test | cache.t3.micro | 1 | ~0.5GB | ~$12.50 |
| Staging | cache.t3.small | 1 | ~1.37GB | ~$25 |
| Production | cache.t3.small | 2 | ~1.37GB + HA | ~$50 |
| Production (ARM) | cache.t4g.small | 2 | ~1.37GB + HA | ~$45 |

```hcl
# Production cache configuration
redis_node_type                    = "cache.t3.small"
redis_num_cache_nodes              = 2
redis_snapshot_retention_limit     = 5
redis_enable_encryption_at_rest    = true
redis_enable_encryption_in_transit = true
```

### Cache Eviction Monitoring

Watch these ElastiCache CloudWatch metrics:
- **Evictions**: Should be < 10% of total GET operations. High evictions mean the node is too small.
- **CurrConnections**: Should stay well below the max (65,000 for t3.micro).
- **DatabaseMemoryUsagePercentage**: Keep below 90%. Above this, upgrade node type.

---

## Lambda Memory and Timeout Optimization

Lambda cost = (memory allocated) × (execution duration) × (number of invocations). Optimizing memory and timeout directly reduces cost.

### Current Lambda Configuration

| Function | Memory | Timeout | Runtime | Reserved Concurrency |
|----------|--------|---------|---------|---------------------|
| WebSocket Connect | 1024MB | 30s | Node.js 22.x | 100 |
| WebSocket Disconnect | 1024MB | 30s | Node.js 22.x | 100 |
| WebSocket Message | 1024MB | 30s | Node.js 22.x | 100 |
| Document Processor (extract-text) | 3008MB | 300s | Python 3.11 | — |
| Generate Embeddings | 1024MB | 300s | Node.js 22.x | — |
| Auth (login/logout/authorizer) | 1024MB | 30s | Node.js 22.x | — |
| Chat History | 1024MB | 30s | Node.js 22.x | — |
| Document Management (upload/list/delete) | 1024MB | 30s | Node.js 22.x | — |
| Vector Store Init | 1024MB | 60s | Node.js 22.x | — |

### Right-Sizing Recommendations

**Step 1: Use AWS Lambda Power Tuning**

Run the [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) tool against each function to find the optimal memory/cost balance. Common findings:

- **Auth functions**: Often work well at 512MB. These do simple JWT validation and DynamoDB lookups.
- **WebSocket connect/disconnect**: Typically fine at 512MB. They only write/delete a DynamoDB item.
- **WebSocket message handler**: Keep at 1024MB. It orchestrates Bedrock streaming, OpenSearch queries, and cache lookups.
- **Document processor**: Keep at 3008MB. PDF parsing is memory-intensive, especially for large documents with tables.
- **Generate embeddings**: Can often drop to 512MB since it's mostly waiting on Bedrock API calls (I/O bound).

**Step 2: Apply changes in Terraform modules**

To reduce auth function memory (example):
```hcl
# terraform/modules/auth/main.tf
resource "aws_lambda_function" "login" {
  # ...
  memory_size = 512   # Reduced from 1024
  timeout     = 10    # Reduced from 30 (login is fast)
}
```

To reduce WebSocket connect/disconnect memory:
```hcl
# terraform/modules/websocket-handlers/main.tf
resource "aws_lambda_function" "connect" {
  # ...
  memory_size = 512   # Reduced from 1024
}

resource "aws_lambda_function" "disconnect" {
  # ...
  memory_size = 512   # Reduced from 1024
}
```

### Timeout Optimization

Shorter timeouts prevent runaway costs from stuck invocations:

| Function | Current | Recommended | Rationale |
|----------|---------|-------------|-----------|
| Auth functions | 30s | 10s | JWT validation + DynamoDB lookup is < 2s |
| WebSocket connect/disconnect | 30s | 10s | Single DynamoDB write is < 1s |
| WebSocket message | 30s | 30s | Keep as-is; Bedrock streaming can take 10-20s |
| Document processor | 300s | 300s | Keep as-is; large PDFs need full 5 minutes |
| Generate embeddings | 300s | 120s | Batch of 25 embeddings typically completes in < 60s |
| Document management | 30s | 15s | S3 presigned URL generation and DynamoDB queries are fast |

### Provisioned Concurrency Tradeoffs

The current config uses reserved concurrency (100) on WebSocket handlers, which limits max concurrent executions but doesn't pre-warm instances. Provisioned concurrency pre-warms instances for lower cold-start latency but adds cost:

| Approach | Cold Start | Cost |
|----------|-----------|------|
| No concurrency config | 500-1000ms | Pay per invocation only |
| Reserved concurrency (current) | 500-1000ms | Pay per invocation only (caps max) |
| Provisioned concurrency (10 instances) | < 10ms | ~$35/mo per function at 1024MB |

**Recommendation**: Avoid provisioned concurrency unless cold starts are causing user-visible latency issues. The WebSocket message handler benefits most from it since it's the hot path.

### Lambda Cost Estimation

Lambda pricing (us-east-2): $0.0000166667 per GB-second, $0.20 per 1M requests.

| Scenario | Invocations/mo | Avg Duration | Memory | Monthly Cost |
|----------|---------------|-------------|--------|-------------|
| Light (1K queries/day) | ~30K | 5s avg | 1024MB | ~$2.50 |
| Moderate (5K queries/day) | ~150K | 5s avg | 1024MB | ~$12.50 |
| Heavy (20K queries/day) | ~600K | 5s avg | 1024MB | ~$50 |

---

## OpenSearch Instance Sizing

OpenSearch is typically the largest fixed cost in the system. Right-sizing the cluster is critical.

### Current Configuration

```hcl
# terraform/terraform.tfvars (dev defaults)
opensearch_instance_type  = "t3.small.search"   # ~$36/mo
opensearch_instance_count = 1                    # Single node, no HA
```

```hcl
# terraform/variables.tf (production defaults)
opensearch_instance_type  = "t3.medium.search"   # ~$55/mo per node
opensearch_instance_count = 3                     # 3-node HA cluster
```

Storage: 100GB gp3 EBS per node (~$8/mo per node).

### Index Configuration

- k-NN enabled with HNSW algorithm
- 1024-dimension vectors (Titan Embeddings v2)
- Parameters: ef_construction=512, m=16, ef_search=512
- Cosine similarity metric

### Sizing Recommendations by Environment

| Environment | Instance Type | Count | EBS/Node | Monthly Cost | Use Case |
|------------|--------------|-------|----------|-------------|----------|
| Dev/Test | t3.small.search | 1 | 100GB gp3 | ~$44 | < 100 documents, single developer |
| Staging | t3.medium.search | 2 | 100GB gp3 | ~$126 | < 1,000 documents, team testing |
| Production (small) | t3.medium.search | 3 | 100GB gp3 | ~$189 | < 5,000 documents, 50 concurrent users |
| Production (large) | r6g.large.search | 3 | 200GB gp3 | ~$540 | 10,000+ documents, 100 concurrent users |

### Terraform Changes for Each Tier

**Dev/Test (current):**
```hcl
opensearch_instance_type  = "t3.small.search"
opensearch_instance_count = 1
```

**Staging:**
```hcl
opensearch_instance_type  = "t3.medium.search"
opensearch_instance_count = 2
```

**Production (small):**
```hcl
opensearch_instance_type  = "t3.medium.search"
opensearch_instance_count = 3
```

**Production (large):**
```hcl
opensearch_instance_type  = "r6g.large.search"
opensearch_instance_count = 3
```

### When to Scale Up

Monitor these CloudWatch metrics for the OpenSearch domain:

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPUUtilization | > 80% sustained | Upgrade instance type |
| JVMMemoryPressure | > 80% | Upgrade instance type (more RAM) |
| SearchLatency | > 200ms p95 | Add nodes or upgrade type |
| FreeStorageSpace | < 20GB | Increase EBS volume size |
| IndexingLatency | > 500ms | Add nodes for write throughput |

### k-NN Tuning for Cost

The HNSW parameters affect both search quality and resource usage:

| Parameter | Current | Lower Cost | Higher Quality |
|-----------|---------|-----------|----------------|
| ef_construction | 512 | 256 | 512 |
| m | 16 | 8 | 16 |
| ef_search | 512 | 256 | 512 |

Lowering these values reduces memory usage and allows smaller instances, at the cost of slightly lower search accuracy. For most RAG use cases, `ef_construction=256, m=8, ef_search=256` provides adequate quality with ~40% less memory.

To change, update the index template in `lambda/vector-store-init/`:
```json
{
  "method": {
    "name": "hnsw",
    "parameters": {
      "ef_construction": 256,
      "m": 8
    }
  }
}
```

---

## Expected Monthly Costs

### Usage Level Definitions

| Level | Queries/Day | Documents | Concurrent Users | Document Uploads/Week |
|-------|------------|-----------|------------------|-----------------------|
| Low | ~500 | < 100 | 5-10 | 5-10 |
| Moderate | ~2,000 | 100-1,000 | 20-50 | 20-50 |
| High | ~10,000 | 1,000-10,000 | 50-100 | 50-100 |

### Low Usage (~$80-120/month)

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| OpenSearch | 1x t3.small.search, 100GB | ~$44 |
| ElastiCache | 1x cache.t3.micro | ~$12.50 |
| NAT Gateway | 1 gateway, minimal traffic | ~$33 |
| Lambda | ~15K invocations | ~$2 |
| DynamoDB | On-demand, minimal | ~$2 |
| Bedrock (Claude) | ~350 uncached queries/day × $0.001 | ~$10 |
| Bedrock (Titan) | ~350 embeddings/day × $0.0001 | ~$1 |
| API Gateway | ~15K requests | ~$1 |
| S3 + CloudFront | Minimal storage/transfer | ~$2 |
| CloudWatch | Logs + metrics | ~$5 |
| KMS | 1 key + API calls | ~$1 |
| **Total** | | **~$113** |

### Moderate Usage (~$150-250/month)

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| OpenSearch | 2x t3.medium.search, 100GB each | ~$126 |
| ElastiCache | 1x cache.t3.small | ~$25 |
| NAT Gateway | 1 gateway, moderate traffic | ~$40 |
| Lambda | ~60K invocations | ~$8 |
| DynamoDB | On-demand, moderate | ~$8 |
| Bedrock (Claude) | ~1,400 uncached queries/day × $0.001 | ~$42 |
| Bedrock (Titan) | ~1,400 embeddings/day × $0.0001 | ~$4 |
| API Gateway | ~60K requests | ~$4 |
| S3 + CloudFront | Moderate storage/transfer | ~$5 |
| CloudWatch | Logs + metrics | ~$10 |
| KMS | 1 key + API calls | ~$2 |
| **Total** | | **~$274** |

> Note: With ≥30% cache hit rate (Requirement 12.5), Bedrock costs drop by ~30%, bringing the total closer to ~$200/mo — meeting the target in Requirement 12.

### High Usage (~$400-700/month)

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| OpenSearch | 3x t3.medium.search, 100GB each | ~$189 |
| ElastiCache | 2x cache.t3.small (HA) | ~$50 |
| NAT Gateway | 1 gateway, high traffic | ~$55 |
| Lambda | ~300K invocations | ~$40 |
| DynamoDB | On-demand, high | ~$25 |
| Bedrock (Claude) | ~7,000 uncached queries/day × $0.001 | ~$210 |
| Bedrock (Titan) | ~7,000 embeddings/day × $0.0001 | ~$21 |
| API Gateway | ~300K requests | ~$15 |
| S3 + CloudFront | High storage/transfer | ~$10 |
| CloudWatch | Logs + metrics | ~$20 |
| KMS | 1 key + API calls | ~$3 |
| **Total** | | **~$638** |

> With ≥30% cache hit rate, Bedrock costs drop to ~$147 for Claude and ~$15 for Titan, bringing the total to ~$490/mo.

### Cost Scaling Summary

| Usage Level | Without Cache | With 30% Cache Hit Rate | Savings |
|------------|--------------|------------------------|---------|
| Low | ~$113/mo | ~$110/mo | ~$3/mo |
| Moderate | ~$274/mo | ~$200/mo | ~$74/mo |
| High | ~$638/mo | ~$490/mo | ~$148/mo |

The cache becomes increasingly valuable at higher usage levels where Bedrock API costs dominate.

---

## Additional Optimization Strategies

### NAT Gateway Alternatives

NAT Gateway is a significant fixed cost (~$32/mo + data transfer). Alternatives:

| Approach | Monthly Cost | Tradeoff |
|----------|-------------|----------|
| NAT Gateway (current) | ~$32+ | Fully managed, high throughput |
| NAT Instance (t3.nano) | ~$4 | Self-managed, lower throughput, single AZ |
| VPC Endpoints only | ~$7/endpoint/mo | Only works for AWS services, not Bedrock |

For dev environments, a NAT Instance can save ~$28/mo:
```hcl
# Replace NAT Gateway with NAT Instance in terraform/modules/networking/
# This requires custom module changes — not a simple variable swap
```

### DynamoDB Cost Control

Current config uses on-demand pricing, which is ideal for variable workloads. For predictable traffic:

| Mode | Cost Model | Best For |
|------|-----------|----------|
| On-demand (current) | $1.25/million writes, $0.25/million reads | Variable/unpredictable traffic |
| Provisioned | ~$0.00065/WCU-hour, ~$0.00013/RCU-hour | Steady, predictable traffic |
| Provisioned + Auto Scaling | Same as provisioned with auto-adjustment | Predictable with occasional spikes |

For moderate usage with predictable patterns, provisioned capacity with auto-scaling can save 20-40%.

### CloudWatch Logs Optimization

365-day log retention (Requirement 11.5) accumulates storage costs. Strategies:

1. **Log filtering**: Only log essential fields, avoid logging full request/response bodies
2. **S3 export**: Export logs older than 30 days to S3 Glacier (~$0.004/GB vs ~$0.03/GB for CloudWatch)
3. **Log level management**: Use INFO in production, DEBUG only in dev

### Bedrock Cost Reduction

Bedrock is the largest variable cost. Beyond caching:

1. **Reduce max_tokens**: Current setting is 2048. If typical responses are shorter, reduce to 1024 to lower output token costs.
2. **Use Claude Haiku 4.5**: Already configured — this is the most cost-effective Claude model for chat.
3. **Prompt optimization**: Shorter system prompts and context reduce input token costs.
4. **Query routing**: The Query Router (task 13) skips RAG retrieval for simple queries, avoiding unnecessary embedding generation and vector search costs.

### S3 Storage Tiers

For document archives that are rarely re-processed:

```hcl
# Add lifecycle rule to terraform/modules/storage/
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "archive-processed"
    status = "Enabled"
    filter { prefix = "processed/" }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"    # ~40% cheaper
    }
    transition {
      days          = 365
      storage_class = "GLACIER"         # ~80% cheaper
    }
  }
}
```

### Reserved Capacity Discounts

For production workloads running 24/7, reserved pricing offers significant savings:

| Service | On-Demand | 1-Year Reserved | 3-Year Reserved |
|---------|-----------|----------------|----------------|
| OpenSearch t3.medium.search | ~$55/mo | ~$35/mo (36% off) | ~$24/mo (56% off) |
| ElastiCache cache.t3.small | ~$25/mo | ~$16/mo (36% off) | ~$10/mo (60% off) |

### Quick Reference: Terraform Variables for Cost Tiers

**Minimum cost (dev):**
```hcl
opensearch_instance_type           = "t3.small.search"
opensearch_instance_count          = 1
redis_node_type                    = "cache.t3.micro"
redis_num_cache_nodes              = 1
redis_snapshot_retention_limit     = 0
redis_enable_encryption_at_rest    = false
redis_enable_encryption_in_transit = false
```

**Balanced (staging/small production):**
```hcl
opensearch_instance_type           = "t3.medium.search"
opensearch_instance_count          = 2
redis_node_type                    = "cache.t3.small"
redis_num_cache_nodes              = 1
redis_snapshot_retention_limit     = 3
redis_enable_encryption_at_rest    = true
redis_enable_encryption_in_transit = true
```

**Production (high availability):**
```hcl
opensearch_instance_type           = "t3.medium.search"
opensearch_instance_count          = 3
redis_node_type                    = "cache.t3.small"
redis_num_cache_nodes              = 2
redis_snapshot_retention_limit     = 5
redis_enable_encryption_at_rest    = true
redis_enable_encryption_in_transit = true
```
