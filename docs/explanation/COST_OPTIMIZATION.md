# ElastiCache Redis Cost Optimization Guide

## Cost Optimization Changes Applied

The ElastiCache Redis cluster has been optimized for minimum cost while maintaining core caching functionality. Below are the changes and their cost impact.

### Configuration Changes

#### 1. Single Node Deployment (Biggest Savings)
**Before:** 2 nodes (Multi-AZ with automatic failover)
**After:** 1 node (Single-AZ, no failover)
**Savings:** ~50% reduction in compute costs

**Trade-offs:**
- ❌ No automatic failover
- ❌ No Multi-AZ redundancy
- ❌ Downtime during maintenance windows
- ✅ Suitable for development/testing environments
- ✅ Cache misses are acceptable (will query source)

#### 2. Smallest Node Type
**Configuration:** `cache.t3.micro`
**Memory:** ~0.5GB usable memory
**Cost:** ~$0.017/hour = ~$12.50/month

**Trade-offs:**
- ⚠️ Less than 1GB requirement from design (but LRU eviction handles this)
- ✅ Sufficient for moderate caching workload
- ✅ LRU eviction policy ensures most-used items stay cached

#### 3. Backups Disabled
**Before:** 5-day snapshot retention
**After:** 0 days (backups disabled)
**Savings:** ~$0.095/GB-month storage costs eliminated

**Trade-offs:**
- ❌ No point-in-time recovery
- ✅ Cache data is ephemeral and can be regenerated
- ✅ No data loss impact (cache misses just query source)

#### 4. Encryption at Rest Disabled
**Before:** KMS encryption enabled
**After:** Encryption disabled
**Savings:** Eliminates KMS key usage costs (~$1/month + $0.03 per 10k requests)

**Trade-offs:**
- ⚠️ Data stored unencrypted on disk
- ✅ Cache contains no sensitive data (just query results)
- ✅ Network isolation provides security
- ⚠️ May not meet compliance requirements for production

#### 5. Encryption in Transit Disabled
**Before:** TLS encryption enabled
**After:** TLS disabled
**Savings:** Reduces CPU overhead, no direct cost savings

**Trade-offs:**
- ⚠️ Data transmitted unencrypted within VPC
- ✅ VPC provides network isolation
- ✅ Reduces latency slightly
- ⚠️ May not meet compliance requirements for production

## Cost Comparison

### Minimum Cost Configuration (Current)
```
Node Type: cache.t3.micro
Nodes: 1
Backups: Disabled
Encryption: Disabled

Monthly Cost: ~$12.50/month
```

### Previous Configuration
```
Node Type: cache.t3.small
Nodes: 2
Backups: 5 days
Encryption: Enabled

Monthly Cost: ~$60/month
```

### Savings: ~$47.50/month (~79% reduction)

## When to Use Cost-Optimized Configuration

✅ **Use for:**
- Development environments
- Testing/staging environments
- Proof-of-concept deployments
- Low-traffic applications
- Non-critical caching workloads

❌ **Don't use for:**
- Production environments with SLA requirements
- Applications requiring high availability
- Compliance-regulated workloads (HIPAA, PCI-DSS, etc.)
- High-traffic applications (>1000 requests/min)

## Upgrading to Production Configuration

For production deployments, update `terraform.tfvars`:

```hcl
# Production Configuration
redis_node_type                    = "cache.t3.small"  # 1.37GB memory
redis_num_cache_nodes              = 2                 # Multi-AZ HA
redis_snapshot_retention_limit     = 5                 # 5-day backups
redis_enable_encryption_at_rest    = true              # KMS encryption
redis_enable_encryption_in_transit = true              # TLS encryption
```

**Production Cost:** ~$60/month

## Alternative Cost Optimizations

### Option 1: ARM-based Instances (Graviton)
```hcl
redis_node_type = "cache.t4g.micro"  # ARM-based, ~10% cheaper
```
**Cost:** ~$11/month (saves ~$1.50/month)

### Option 2: Reserved Instances
- Purchase 1-year or 3-year reserved capacity
- Savings: 30-50% off on-demand pricing
- Best for stable, long-running production workloads

### Option 3: Scheduled Scaling
- Use Lambda to stop/start cluster during off-hours
- Suitable for dev/test environments
- Savings: ~50% if running 12 hours/day

## Monitoring Cost-Optimized Cluster

Key metrics to watch:

1. **Evictions** - Should be low (<10% of gets)
   - High evictions = need larger node type
   
2. **CPU Utilization** - Should be <75%
   - High CPU = need larger node type
   
3. **Memory Usage** - Should be <90%
   - High memory = need larger node type or more aggressive TTLs

4. **Cache Hit Rate** - Should be >30%
   - Low hit rate = cache not effective, consider disabling

## Disabling Cache Entirely

If cache hit rate is consistently low (<20%), consider disabling ElastiCache entirely:

```hcl
# Comment out cache module in main.tf
# module "cache" { ... }
```

**Additional Savings:** $12.50/month
**Trade-off:** All requests go directly to Bedrock/OpenSearch (higher latency, higher API costs)

## Recommendations

**For Development:**
- ✅ Use current cost-optimized configuration
- ✅ Monitor eviction rates and cache hit rates
- ✅ Disable if hit rate <20%

**For Production:**
- ⚠️ Upgrade to 2-node cluster with encryption
- ⚠️ Enable backups for disaster recovery
- ⚠️ Use cache.t3.small or larger for 1GB memory
- ⚠️ Consider reserved instances for long-term savings

**For Compliance:**
- ❌ Must enable encryption at rest and in transit
- ❌ Must enable backups with appropriate retention
- ❌ Must use Multi-AZ for high availability
- ❌ Cost-optimized config not suitable
