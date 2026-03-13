# Integration and Performance Tests

This directory contains integration tests and performance benchmarks for the AWS Claude RAG Chatbot.

## Test Suites

### 1. Integration Tests (`backend-integration.test.ts`)
- Complete user flow testing
- Document upload and processing
- RAG query flow
- WebSocket connection stability

### 2. Error Resilience Tests (`error-resilience.test.ts`)
- OpenSearch fallback behavior
- Bedrock throttling and retry logic
- Document processing failure handling
- Circuit breaker activation

### 3. Security Configuration Tests (`security-config.test.ts`)
- S3 encryption verification
- DynamoDB encryption verification
- IAM role validation
- API Gateway authentication
- TLS configuration

### 4. Audit Logging Tests (`audit-logging.test.ts`)
- User action logging
- Document operation logging
- Bedrock API call logging
- Log retention verification

### 5. Performance Benchmarks (`performance-benchmarks.test.ts`)
- Query response time (with/without RAG)
- Document processing time
- Vector store query latency
- Cache hit rate

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:error-resilience
npm run test:performance
```

### Run with Verbose Output
```bash
npm run test:verbose
```

## Configuration

Tests automatically load configuration from:
1. **Terraform outputs** (preferred): `terraform output -json`
2. **Environment variables**: Manual configuration
3. **Defaults**: Local development values

### Required AWS Resources
- Bedrock access (Claude Haiku 4.5, Titan Embeddings)
- S3 bucket for documents
- DynamoDB tables (Sessions, ChatHistory, DocumentMetadata, RateLimits)
- OpenSearch cluster (optional for local testing)
- Valid AWS credentials

## OpenSearch Connectivity

⚠️ **Important**: OpenSearch is deployed in a private VPC subnet for security.

### When Running Locally

You will see warnings like:
```
⚠ OpenSearch not accessible (tests will skip OpenSearch operations)
⚠ RAG query test failed: connect ETIMEDOUT 10.0.x.x:443
```

**This is expected and normal.** Tests will automatically skip OpenSearch-dependent operations.

### Tests That Work Locally (without OpenSearch)
- ✅ Benchmark 1: Query Response Time Without RAG
- ✅ Benchmark 3: Document Processing Time
- ✅ Benchmark 5: Cache Hit Rate
- ✅ Most integration tests (with degraded functionality)

### Tests That Require OpenSearch Access
- ⚠️ Benchmark 2: Query Response Time With RAG
- ⚠️ Benchmark 4: Vector Store Query Latency
- ⚠️ RAG-specific integration tests

### Running Full Tests (with OpenSearch)

To run tests that require OpenSearch access:

**Option 1: EC2 Instance in VPC** (Recommended)
```bash
# Launch EC2 in same VPC as OpenSearch
# SSH or use Session Manager to connect
# Install Node.js and dependencies
cd lambda/tests/integration
npm install
npm test
```

**Option 2: VPN Connection**
- Set up VPN to the VPC
- Run tests through VPN connection

**Option 3: AWS Systems Manager Session Manager**
- Use Session Manager to connect to EC2
- Run tests through the session

## Test Output

Tests provide detailed output including:
- ✅ Passed tests with metrics
- ⚠️ Warnings for skipped operations
- ❌ Failed tests with error details
- 📊 Performance statistics (min/max/avg/p95/p99)

## Cost Considerations

Running the full test suite costs approximately **< $1.00**:
- Bedrock API calls: ~$0.001 per 1K tokens
- Bedrock embeddings: ~$0.0001 per 1K tokens
- S3/DynamoDB operations: Minimal
- OpenSearch queries: Included in cluster cost

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### "AWS credentials not found"
```bash
aws configure
# or
export AWS_PROFILE=your-profile
```

### "Terraform outputs not found"
Set environment variables manually:
```bash
export AWS_REGION=us-east-2
export DOCUMENTS_BUCKET=your-bucket-name
export SESSIONS_TABLE=your-sessions-table
# ... etc
```

### OpenSearch timeout errors
This is expected when running locally. See "OpenSearch Connectivity" section above.

## Related Documentation

- [Performance Benchmarks Guide](./PERFORMANCE_BENCHMARKS.md)
- [Requirements Document](../../.kiro/specs/aws-claude-rag-agent/requirements.md)
- [Design Document](../../.kiro/specs/aws-claude-rag-agent/design.md)
- [Main README](../../../README.md)
