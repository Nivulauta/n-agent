# Integration Tests

This directory contains integration tests for the AWS Claude RAG Agent system. The tests validate error handling, resilience, and end-to-end functionality against real AWS resources.

## Configuration

The integration tests automatically load configuration from Terraform outputs, falling back to environment variables or defaults.

### Configuration Priority

1. **Terraform outputs** (highest priority) - Executed via `terraform output -json` command
2. **Environment variables** - Set manually or via setup scripts
3. **Default values** (lowest priority) - Used for local development

### Setup Methods

#### Method 1: Automatic (Recommended)

The tests automatically load configuration from Terraform state:

```bash
# Ensure Terraform has been applied
cd terraform
terraform apply

# Run tests (configuration loaded automatically)
cd ../lambda/tests/integration
npm test
```

#### Method 2: Using Setup Scripts

For explicit configuration loading:

**Linux/macOS:**
```bash
# Load configuration from Terraform
source ./setup-test-config.sh

# Run tests
npm test
```

**Windows PowerShell:**
```powershell
# Load configuration from Terraform
. .\setup-test-config.ps1

# Run tests
npm test
```

#### Method 3: Manual Environment Variables

Set environment variables manually:

```bash
export AWS_REGION=us-east-1
export DOCUMENTS_BUCKET=your-documents-bucket
export DOCUMENT_METADATA_TABLE=your-document-metadata-table
export SESSIONS_TABLE=your-sessions-table
export CHAT_HISTORY_TABLE=your-chat-history-table
export RATE_LIMITS_TABLE=your-rate-limits-table
export CONNECTIONS_TABLE=your-connections-table
export OPENSEARCH_ENDPOINT=your-opensearch-endpoint
export REDIS_ENDPOINT=your-redis-endpoint
export REDIS_PORT=6379

npm test
```

## Available Tests

### error-resilience.test.ts

Tests error handling and resilience mechanisms:

- **OpenSearch Unavailable**: Validates fallback to direct LLM (Requirement 14.2)
- **Bedrock Throttling**: Tests retry with exponential backoff (Requirement 14.3)
- **Document Processing Failures**: Validates dead-letter queue (Requirement 14.3)
- **Circuit Breaker**: Tests activation after 5 failures (Requirement 14.4)
- **Graceful Degradation**: Validates reduced functionality mode (Requirement 14.5)

**Run specific test suite:**
```bash
npm test -- error-resilience.test.ts
```

**Run specific test:**
```bash
npm test -- error-resilience.test.ts -t "OpenSearch Unavailable"
```

### load-concurrent-users.test.ts

Tests concurrent user support and performance under load:

- **100 Concurrent WebSocket Connections**: Validates Lambda scaling (Requirement 9.1)
- **Vector Store Query Performance**: Tests concurrent query handling (Requirement 9.3)
- **WebSocket Connection Capacity**: Validates connection stability (Requirement 9.4)
- **50 Concurrent Chat Requests**: Tests Bedrock service capacity with response time validation (Requirement 9.5)

**Run load tests:**
```bash
npm test -- load-concurrent-users.test.ts
```

**See detailed guide:**
```bash
cat LOAD_TEST_GUIDE.md
```

### e2e-user-flow.test.ts

Tests complete end-to-end user flows:

- **Login → Upload → Process → Query**: Complete user journey with RAG
- **Document Search Results**: Validates document appears after processing
- **Chat with Citations**: Tests chat responses include document citations
- **WebSocket Stability**: Tests connection persistence over extended sessions

**Run E2E tests:**
```bash
npm test -- e2e-user-flow.test.ts
```

### security-verification.test.ts

Tests security configurations and compliance:

- **S3 Encryption**: Validates encryption at rest
- **DynamoDB Encryption**: Validates table encryption
- **IAM Least Privilege**: Tests role permissions
- **API Gateway Authentication**: Validates authentication requirements
- **TLS Configuration**: Tests encryption in transit

**Run security tests:**
```bash
npm test -- security-verification.test.ts
```

### audit-logging-verification.test.ts

Tests audit logging completeness:

- **User Action Logging**: Validates all user actions are logged
- **Document Operation Logging**: Tests document upload/delete logging
- **Bedrock API Call Logging**: Validates API call logging
- **Log Retention**: Tests 365-day retention configuration

**Run audit tests:**
```bash
npm test -- audit-logging-verification.test.ts
```

## Configuration Reference

### Required Configuration

These values must be set (via Terraform, environment variables, or defaults):

| Variable | Terraform Output | Description |
|----------|------------------|-------------|
| `AWS_REGION` | N/A | AWS region (default: us-east-1) |
| `DOCUMENTS_BUCKET` | `s3_documents_bucket_name` | S3 bucket for documents |
| `DOCUMENT_METADATA_TABLE` | `dynamodb_document_metadata_table_name` | DynamoDB table for document metadata |
| `SESSIONS_TABLE` | `dynamodb_sessions_table_name` | DynamoDB table for user sessions |
| `CHAT_HISTORY_TABLE` | `dynamodb_chat_history_table_name` | DynamoDB table for chat history |

### Optional Configuration

These values enhance test coverage but are not required:

| Variable | Terraform Output | Description | Default |
|----------|------------------|-------------|---------|
| `RATE_LIMITS_TABLE` | `dynamodb_rate_limits_table_name` | DynamoDB table for rate limiting | chatbot-rate-limits |
| `CONNECTIONS_TABLE` | `dynamodb_connections_table_name` | DynamoDB table for WebSocket connections | chatbot-connections |
| `OPENSEARCH_ENDPOINT` | `opensearch_endpoint` | OpenSearch cluster endpoint | localhost:9200 |
| `REDIS_ENDPOINT` | `redis_endpoint` | Redis cache endpoint | localhost:6379 |
| `REDIS_PORT` | `redis_port` | Redis port | 6379 |
| `REST_API_URL` | `rest_api_url` | REST API Gateway URL | http://localhost:3000 |
| `WEBSOCKET_API_URL` | `websocket_stage_url` | WebSocket API URL | ws://localhost:3001 |
| `KMS_KEY_ARN` | `kms_key_arn` | KMS key for encryption | (empty) |
| `TEST_TIMEOUT` | N/A | Test timeout in milliseconds | 60000 |

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test -- error-resilience.test.ts
```

### Run with Verbose Output

```bash
npm test -- --reporter=verbose
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Watch Mode (for development)

```bash
npm test -- --watch
```

## Test Data Cleanup

Tests automatically clean up test data in `afterAll` hooks. However, if tests fail unexpectedly, you may need to manually clean up:

### DynamoDB Cleanup

```bash
# List test items
aws dynamodb scan \
  --table-name your-document-metadata-table \
  --filter-expression "begins_with(PK, :prefix)" \
  --expression-attribute-values '{":prefix":{"S":"test-"}}'

# Delete specific test item
aws dynamodb delete-item \
  --table-name your-document-metadata-table \
  --key '{"PK":{"S":"test-doc-123"},"SK":{"S":"METADATA"}}'
```

### S3 Cleanup

```bash
# List test objects
aws s3 ls s3://your-documents-bucket/uploads/ --recursive | grep test-

# Delete test objects
aws s3 rm s3://your-documents-bucket/uploads/test-doc-123/ --recursive
aws s3 rm s3://your-documents-bucket/failed/test-doc-123/ --recursive
```

## Troubleshooting

### ResourceNotFoundException

**Problem:** DynamoDB table or S3 bucket doesn't exist

**Solution:**
1. Verify Terraform has been applied: `cd terraform && terraform apply`
2. Check table/bucket names match Terraform outputs: `terraform output`
3. Verify AWS credentials have access to resources

### AccessDenied

**Problem:** Insufficient IAM permissions

**Solution:**
1. Verify AWS credentials are configured: `aws sts get-caller-identity`
2. Check IAM policies allow DynamoDB and S3 access
3. Ensure bucket policies and table policies allow access

### Test Timeouts

**Problem:** Tests exceed timeout limit

**Solution:**
1. Increase timeout: `export TEST_TIMEOUT=120000` (2 minutes)
2. Check network connectivity to AWS
3. Verify AWS services are responding

### Configuration Not Loading

**Problem:** Tests use default values instead of Terraform outputs

**Solution:**
1. Verify terraform.tfstate exists: `ls terraform/terraform.tfstate`
2. Check Terraform outputs are populated: `cd terraform && terraform output`
3. Run setup script explicitly: `source ./setup-test-config.sh`
4. Check for errors in test output

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Dependencies
        run: |
          cd lambda/tests/integration
          npm install
      
      - name: Run Integration Tests
        run: |
          cd lambda/tests/integration
          npm test
```

## Best Practices

1. **Always run tests against a test/staging environment**, never production
2. **Use separate AWS accounts** for testing to avoid accidental data modification
3. **Run tests before deploying** to catch integration issues early
4. **Monitor test execution time** and optimize slow tests
5. **Review test data cleanup** to avoid accumulating test artifacts
6. **Keep test data isolated** using unique identifiers (timestamps, UUIDs)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review test output for specific error messages
3. Verify AWS resource configuration in Terraform
4. Check CloudWatch logs for Lambda execution errors
