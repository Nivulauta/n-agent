# OpenSearch Access for Testing

## Problem

When running integration tests or performance benchmarks locally, you may encounter:

```
⚠ OpenSearch not accessible (tests will skip OpenSearch operations)
⚠ RAG query test failed: connect ETIMEDOUT 10.0.1.110:443
```

## Why This Happens

OpenSearch is deployed in a **private VPC subnet** for security. It's not accessible from the public internet or your local machine. This is intentional and follows AWS security best practices.

## Impact on Testing

### Tests That Work Locally ✅
These tests don't require OpenSearch and will run successfully:
- Query Response Time Without RAG (Benchmark 1)
- Document Processing Time (Benchmark 3)
- Cache Hit Rate (Benchmark 5)
- Authentication tests
- S3 upload tests
- DynamoDB operations
- Bedrock API calls

### Tests That Require OpenSearch ⚠️
These tests will show warnings and skip operations:
- Query Response Time With RAG (Benchmark 2)
- Vector Store Query Latency (Benchmark 4)
- RAG retrieval integration tests
- Vector search tests

## Solutions

### Option 1: Accept Limited Testing (Easiest)

**When to use:** Quick local development and testing

**What happens:**
- Tests automatically detect OpenSearch is unavailable
- OpenSearch-dependent operations are skipped
- Other tests run normally
- You see warnings but tests don't fail

**No action needed** - this is the default behavior.

### Option 2: Run Tests from EC2 in VPC (Recommended for Full Testing)

**When to use:** Full integration testing before deployment

**Steps:**
1. Launch an EC2 instance in the same VPC as OpenSearch
   ```bash
   # Use AWS Console or CLI to launch EC2
   # Choose same VPC and subnet group as OpenSearch
   # Ensure security group allows outbound HTTPS (443)
   ```

2. Connect to EC2 via SSH or Session Manager
   ```bash
   aws ssm start-session --target i-1234567890abcdef0
   ```

3. Install Node.js and dependencies
   ```bash
   # Install Node.js
   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
   sudo yum install -y nodejs git
   
   # Clone your repository
   git clone <your-repo-url>
   cd <repo>/lambda/tests/integration
   
   # Install dependencies
   npm install
   ```

4. Configure AWS credentials
   ```bash
   # Option A: Use instance profile (recommended)
   # Attach IAM role to EC2 with necessary permissions
   
   # Option B: Configure credentials manually
   aws configure
   ```

5. Run tests
   ```bash
   npm test
   npm run test:performance
   ```

### Option 3: VPN Connection

**When to use:** Frequent testing from local machine

**Steps:**
1. Set up AWS Client VPN or Site-to-Site VPN to your VPC
2. Connect to VPN
3. Run tests locally through VPN connection

**Pros:**
- Run tests from your local machine
- Full OpenSearch access

**Cons:**
- Requires VPN setup and maintenance
- Additional AWS costs for VPN

### Option 4: Bastion Host with Port Forwarding

**When to use:** Occasional full testing without VPN

**Steps:**
1. Launch bastion host in public subnet
2. Set up SSH tunnel with port forwarding
   ```bash
   ssh -i key.pem -L 9200:opensearch-endpoint:443 ec2-user@bastion-ip
   ```
3. Update test configuration to use localhost:9200
4. Run tests locally

**Pros:**
- No VPN needed
- Temporary access

**Cons:**
- Less secure than VPN
- Requires manual tunnel setup each time

## Recommended Approach by Use Case

### Local Development
✅ **Option 1: Accept Limited Testing**
- Fast iteration
- Test non-OpenSearch components
- Verify Bedrock integration

### Pre-Deployment Validation
✅ **Option 2: EC2 in VPC**
- Full integration testing
- Validate RAG pipeline
- Performance benchmarks

### CI/CD Pipeline
✅ **Option 2: EC2 in VPC**
- Run tests from CodeBuild in VPC
- Or use GitHub Actions self-hosted runner in VPC

### Frequent Full Testing
✅ **Option 3: VPN Connection**
- Convenient for daily use
- Full access from local machine

## Test Behavior Without OpenSearch

The test suite is designed to gracefully handle OpenSearch unavailability:

1. **Connection Test**: Tests ping OpenSearch with 3-second timeout
2. **Graceful Degradation**: If ping fails, `opensearchClient` is set to `undefined`
3. **Conditional Execution**: Tests check `if (opensearchClient)` before OpenSearch operations
4. **Warning Messages**: Clear warnings indicate skipped operations
5. **No Failures**: Tests don't fail due to OpenSearch unavailability

## Security Considerations

### Why OpenSearch is Private

OpenSearch contains sensitive document embeddings and metadata. Keeping it in a private subnet:
- Prevents unauthorized access
- Reduces attack surface
- Complies with security best practices
- Meets compliance requirements

### Don't Make OpenSearch Public

❌ **Do not** modify security groups to allow public access
❌ **Do not** attach public IP to OpenSearch
❌ **Do not** expose OpenSearch through public load balancer

Instead, use one of the solutions above to access OpenSearch securely.

## Troubleshooting

### Error: "connect ETIMEDOUT"
**Cause:** OpenSearch is in private subnet  
**Solution:** Use Option 2 (EC2 in VPC) or accept limited testing

### Error: "ECONNREFUSED"
**Cause:** Security group blocking connection  
**Solution:** Verify security group allows inbound 443 from your source

### Error: "UnauthorizedOperation"
**Cause:** IAM permissions insufficient  
**Solution:** Ensure IAM role/user has OpenSearch access permissions

### Tests hang for long time
**Cause:** Connection timeout too long  
**Solution:** Tests now have 3-second timeout - update to latest version

## Monitoring OpenSearch Health

Even without direct access, you can monitor OpenSearch:

```bash
# Check cluster health via CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/ES \
  --metric-name ClusterStatus.green \
  --dimensions Name=DomainName,Value=your-domain \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average

# Check via Terraform outputs
terraform output opensearch_endpoint
terraform output opensearch_dashboard_endpoint
```

## Related Documentation

- [Integration Tests README](./README.md)
- [Performance Benchmarks Guide](./PERFORMANCE_BENCHMARKS.md)
- [AWS VPC Documentation](https://docs.aws.amazon.com/vpc/)
- [OpenSearch Security Best Practices](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/security.html)
