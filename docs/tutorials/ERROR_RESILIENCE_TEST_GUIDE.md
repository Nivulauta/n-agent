# Error Scenarios and Resilience Integration Tests

## Overview

This test suite validates the system's ability to handle various failure scenarios and maintain resilience as specified in Requirements 14.2, 14.3, and 14.4.

**Task:** 24.2 Test error scenarios and resilience

## Test Coverage

### 1. OpenSearch Unavailable - Fallback to Direct LLM (Requirement 14.2)

Tests that when the Vector_Store (OpenSearch) is unavailable, the RAG_System falls back to direct LLM responses without retrieval.

**Test Cases:**
- `should detect OpenSearch unavailability` - Verifies the system can detect when OpenSearch is down
- `should process query without retrieval when OpenSearch is down` - Confirms queries are processed using direct LLM without vector search
- `should log OpenSearch failures for monitoring` - Ensures failures are logged for operational visibility

**Expected Behavior:**
- System detects OpenSearch connection failures
- Queries are routed to direct LLM (Bedrock) without retrieval
- No retrieved chunks are included in the response
- Fallback mode is activated and logged
- Users receive responses despite OpenSearch being unavailable

### 2. Bedrock Throttling - Retry with Exponential Backoff (Requirement 14.3)

Tests that when Bedrock returns throttling errors, the Lambda_Handler retries up to 3 times with exponential backoff.

**Test Cases:**
- `should retry Bedrock API calls with exponential backoff` - Validates retry pattern (1s, 2s, 4s delays)
- `should succeed after retry when Bedrock recovers` - Confirms successful recovery after retries
- `should fail gracefully after 3 failed retry attempts` - Verifies graceful failure with user-friendly message

**Expected Behavior:**
- First retry after 1 second
- Second retry after 2 seconds
- Third retry after 4 seconds
- Success if any retry succeeds
- User-friendly error message if all retries fail
- Total of 3 retry attempts maximum

### 3. Document Processing Failures - Dead Letter Queue (Requirement 14.3)

Tests that when document processing fails, the Document_Processor moves failed documents to a dead-letter queue for manual review.

**Test Cases:**
- `should move failed document to dead-letter queue` - Verifies DLQ entry creation
- `should preserve original document in failed/ folder` - Confirms document preservation in S3
- `should include error details in DLQ for debugging` - Validates comprehensive error information

**Expected Behavior:**
- Failed documents are moved to DLQ table
- Original documents are preserved in `failed/` S3 folder
- Error details include:
  - Failure reason and type
  - Error stack trace
  - Processing duration
  - File metadata (size, page count)
  - Suggested remediation actions
  - Retryable flag

### 4. Circuit Breaker - Activation After 5 Consecutive Failures (Requirement 14.4)

Tests that the Lambda_Handler implements circuit breaker patterns with a 5-failure threshold.

**Test Cases:**
- `should track consecutive failures` - Verifies failure counting
- `should open circuit breaker after 5 consecutive failures` - Confirms circuit opens at threshold
- `should reject requests when circuit breaker is open` - Validates request rejection
- `should transition to half-open state after timeout period` - Tests recovery mechanism
- `should close circuit breaker after successful request in half-open state` - Confirms circuit closure

**Expected Behavior:**
- Circuit breaker tracks consecutive failures
- Circuit opens after 5 consecutive failures
- Requests are rejected when circuit is open
- Circuit transitions to half-open after 30-second timeout
- Circuit closes after successful request in half-open state
- Failure counter resets on success

**Circuit Breaker States:**
- **Closed** (normal): All requests pass through
- **Open** (failing): All requests are rejected immediately
- **Half-Open** (testing): Limited requests allowed to test recovery

### 5. Graceful Degradation - System Continues with Reduced Functionality (Requirement 14.5)

Tests that when components fail, the system continues serving requests with degraded functionality rather than complete failure.

**Test Cases:**
- `should serve requests with degraded functionality when multiple services fail` - Validates partial operation
- `should notify users of degraded functionality` - Confirms user notification

**Expected Behavior:**
- System identifies available vs unavailable services
- Degraded mode is activated
- Available features continue to work (e.g., direct LLM queries)
- Unavailable features are clearly identified (e.g., document search)
- Users are notified of service degradation
- System does not fail completely

## Running the Tests

### Prerequisites

The tests automatically load configuration from Terraform outputs. Ensure you have:

1. **Terraform Applied**: Run `terraform apply` in the `terraform/` directory
2. **AWS Credentials**: Configure AWS credentials with access to deployed resources
3. **Node.js Dependencies**: Run `npm install` in the test directory

### Configuration Loading

The tests use the `load-terraform-config.ts` module which automatically:
1. Executes `terraform output -json` command in the `terraform/` directory
2. Falls back to environment variables if Terraform command fails
3. Uses default values for local development

**Configuration priority:**
1. Terraform outputs via `terraform output -json` (highest)
2. Environment variables
3. Default values (lowest)

### Running Tests

```bash
# Navigate to integration tests directory
cd lambda/tests/integration

# Install dependencies (if not already done)
npm install

# Run all error resilience tests (configuration loaded automatically)
npm test -- error-resilience.test.ts

# Run specific test suite
npm test -- error-resilience.test.ts -t "OpenSearch Unavailable"

# Run with verbose output
npm test -- error-resilience.test.ts --reporter=verbose
```

### Manual Configuration (Optional)

If you prefer to set environment variables manually:

**Linux/macOS:**
```bash
source ./setup-test-config.sh
npm test
```

**Windows PowerShell:**
```powershell
. .\setup-test-config.ps1
npm test
```

**Manual environment variables:**
```bash
export AWS_REGION=us-east-1
export DOCUMENTS_BUCKET=your-documents-bucket
export DOCUMENT_METADATA_TABLE=your-document-metadata-table
# ... other variables
npm test
```

### Test Environment Setup

For local testing without real AWS resources, you can:

1. **Use LocalStack**: Run LocalStack to simulate AWS services locally
   ```bash
   docker run -d -p 4566:4566 localstack/localstack
   export AWS_ENDPOINT=http://localhost:4566
   ```

2. **Mock AWS Services**: The tests are designed to gracefully handle missing resources in test environments

3. **Use Test AWS Account**: Create a dedicated test AWS account with isolated resources

## Test Data

The tests use the following naming conventions for test data:

- **User IDs**: `test-user-{timestamp}`
- **Document IDs**: `test-doc-{timestamp}`, `failed-doc-{timestamp}`
- **Session IDs**: `test-session-{timestamp}`
- **Query IDs**: `query-{timestamp}`
- **Request IDs**: `bedrock-request-{timestamp}`
- **Circuit Breaker IDs**: `circuit-breaker-{timestamp}`

All test data includes timestamps to ensure uniqueness and avoid conflicts.

## Cleanup

The tests include cleanup logic in `afterAll` hooks to remove test data. However, if tests fail unexpectedly, you may need to manually clean up:

```bash
# List test items in DynamoDB
aws dynamodb scan --table-name your-document-metadata-table \
  --filter-expression "begins_with(PK, :prefix)" \
  --expression-attribute-values '{":prefix":{"S":"test-"}}'

# Delete test objects from S3
aws s3 rm s3://your-documents-bucket/uploads/test-doc- --recursive
aws s3 rm s3://your-documents-bucket/failed/test-doc- --recursive
```

## Integration with CI/CD

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Error Resilience Tests
  env:
    AWS_REGION: ${{ secrets.AWS_REGION }}
    DOCUMENTS_BUCKET: ${{ secrets.DOCUMENTS_BUCKET }}
    DOCUMENT_METADATA_TABLE: ${{ secrets.DOCUMENT_METADATA_TABLE }}
  run: |
    cd lambda/tests/integration
    npm install
    npm test -- error-resilience.test.ts
```

## Troubleshooting

### Common Issues

1. **ResourceNotFoundException**: DynamoDB table doesn't exist
   - Verify table names in environment variables
   - Ensure tables are created in the correct region
   - Check AWS credentials have access to tables

2. **NoSuchBucket**: S3 bucket doesn't exist
   - Verify bucket name in environment variables
   - Ensure bucket exists in the correct region
   - Check AWS credentials have access to bucket

3. **AccessDenied**: Insufficient permissions
   - Verify IAM role/user has required permissions
   - Check bucket policies and table policies
   - Ensure credentials are correctly configured

4. **Timeout**: Tests taking too long
   - Increase test timeout in vitest.config.ts
   - Check network connectivity to AWS
   - Verify AWS services are responding

### Debug Mode

Run tests with debug logging:

```bash
DEBUG=* npm test -- error-resilience.test.ts
```

## Success Criteria

All tests should pass when:

1. ✅ OpenSearch failures trigger fallback to direct LLM
2. ✅ Bedrock throttling triggers exponential backoff retries (3 attempts)
3. ✅ Document processing failures move documents to DLQ
4. ✅ Circuit breaker opens after 5 consecutive failures
5. ✅ Circuit breaker transitions through states correctly
6. ✅ System continues with degraded functionality when services fail
7. ✅ Users are notified of service degradation

## Related Documentation

- [Requirements Document](../../../.kiro/specs/aws-claude-rag-agent/requirements.md) - Requirement 14
- [Design Document](../../../.kiro/specs/aws-claude-rag-agent/design.md) - Error handling architecture
- [Backend Integration Tests](./backend-integration.test.ts) - Related integration tests
- [E2E Test Guide](./E2E_TEST_GUIDE.md) - End-to-end testing guide
