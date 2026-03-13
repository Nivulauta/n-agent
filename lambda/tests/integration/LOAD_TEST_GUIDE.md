# Load Test Guide: Concurrent User Support

## Overview

This guide explains how to run load tests for concurrent user support (Task 20.3). The load tests validate that the system can handle 100 concurrent users with acceptable performance.

## Test Coverage

The load test suite (`load-concurrent-users.test.ts`) validates the following requirements:

### Requirement 9.1: Lambda Handler Scaling
- **Test**: 100 concurrent WebSocket connections
- **Validation**: System automatically scales to support concurrent users
- **Success Criteria**: At least 80% connection success rate

### Requirement 9.3: Vector Store Query Performance
- **Test**: Concurrent query handling
- **Validation**: System maintains performance under concurrent load
- **Success Criteria**: Successful query execution with reasonable response times

### Requirement 9.4: WebSocket Connection Capacity
- **Test**: 100 simultaneous WebSocket connections
- **Validation**: Connections remain stable without degradation
- **Success Criteria**: At least 90% of connections remain responsive

### Requirement 9.5: Bedrock Service Concurrent Requests
- **Test**: 50 concurrent chat requests
- **Validation**: Response times remain under 2 seconds
- **Success Criteria**: 
  - At least 80% success rate
  - At least 70% of responses under 2 seconds

## Prerequisites

### 1. Infrastructure Deployment

The load tests require a fully deployed AWS infrastructure:

```bash
cd terraform
terraform init
terraform apply
```

### 2. Environment Configuration

The tests automatically load configuration from Terraform outputs. Alternatively, you can set environment variables:

```bash
export AWS_REGION=us-east-2
export DOCUMENTS_BUCKET=chatbot-documents-dev
export SESSIONS_TABLE=chatbot-sessions
export CHAT_HISTORY_TABLE=chatbot-chat-history
export VITE_WS_URL=wss://your-websocket-api-id.execute-api.us-east-2.amazonaws.com/dev
export JWT_SECRET=your-secret-key  # Must match the secret used by Lambda Authorizer
```

**Important**: The `JWT_SECRET` environment variable must match the secret configured in your Lambda Authorizer. By default, this is `'your-secret-key'` for development environments. In production, this should be retrieved from AWS Secrets Manager.

### 3. AWS Credentials

Ensure AWS credentials are configured:

```bash
aws configure
# or
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

### 4. Install Dependencies

```bash
cd lambda/tests/integration
npm install
```

## Running Load Tests

### Run All Load Tests

```bash
npm test load-concurrent-users.test.ts
```

### Run with Verbose Output

```bash
npm run test:verbose -- load-concurrent-users.test.ts
```

### Run Specific Test Suite

```bash
# Test WebSocket connections only
npx vitest run load-concurrent-users.test.ts -t "should support 100 concurrent WebSocket connections"

# Test concurrent chat requests only
npx vitest run load-concurrent-users.test.ts -t "should handle at least 50 concurrent chat requests"
```

## Test Configuration

The load tests use the following default configuration:

```typescript
{
  concurrentUsers: 100,           // Number of concurrent users to simulate
  responseTimeThreshold: 2000,    // 2 seconds (requirement threshold)
  connectionTimeout: 10000,       // 10 seconds for connection establishment
  messageTimeout: 30000,          // 30 seconds for message response
  testTimeout: 180000,            // 3 minutes total test timeout
}
```

### Customizing Configuration

You can customize the test configuration by setting environment variables:

```bash
# Test with 50 concurrent users instead of 100
export CONCURRENT_USERS=50

# Increase timeout for slower environments
export TEST_TIMEOUT=300000  # 5 minutes
```

## Understanding Test Results

### Connection Test Results

```
Connection Results:
  Successful: 95/100 (95.0%)
  Failed: 5/100
```

- **Successful**: Number of WebSocket connections established successfully
- **Failed**: Number of connection failures
- **Success Rate**: Percentage of successful connections (target: ≥80%)

### Response Time Statistics

```
Response Time Statistics:
  Successful Queries: 48/50
  Average: 1450ms
  Min: 850ms
  Max: 1980ms
  Under 2s: 47/48 (97.9%)

Percentiles:
  P50: 1400ms
  P95: 1850ms
  P99: 1980ms
```

- **Average**: Mean response time across all successful requests
- **Min/Max**: Fastest and slowest response times
- **Under 2s**: Percentage meeting the 2-second requirement (target: ≥70%)
- **Percentiles**: Distribution of response times

### Connection Health

```
Connection Health:
  Responsive: 92/95 (96.8%)
```

- **Responsive**: Connections that respond to ping/pong (target: ≥90%)

## Troubleshooting

### Issue: Connection Timeouts

**Symptoms**: Many connections fail with "WebSocket connection timeout"

**Possible Causes**:
- Lambda cold starts
- Insufficient Lambda concurrency
- Network issues

**Solutions**:
1. Increase connection timeout:
   ```bash
   export CONNECTION_TIMEOUT=20000  # 20 seconds
   ```

2. Configure provisioned concurrency for WebSocket handler Lambda:
   ```bash
   cd terraform
   # Edit modules/websocket-handlers/main.tf
   # Add provisioned_concurrent_executions = 10
   terraform apply
   ```

3. Run tests during off-peak hours

### Issue: High Response Times

**Symptoms**: Many responses exceed 2 seconds

**Possible Causes**:
- Bedrock throttling
- OpenSearch performance
- Lambda memory allocation

**Solutions**:
1. Check CloudWatch metrics for throttling:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Throttles \
     --dimensions Name=FunctionName,Value=chat-handler \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-01T23:59:59Z \
     --period 3600 \
     --statistics Sum
   ```

2. Increase Lambda memory allocation in Terraform

3. Enable caching to reduce Bedrock calls

### Issue: Test Cleanup Failures

**Symptoms**: "Failed to delete batch of sessions" warnings

**Possible Causes**:
- DynamoDB throttling
- Insufficient IAM permissions

**Solutions**:
1. Cleanup is non-critical and can be ignored
2. Manually clean up test sessions:
   ```bash
   aws dynamodb scan \
     --table-name chatbot-sessions \
     --filter-expression "begins_with(PK, :prefix)" \
     --expression-attribute-values '{":prefix":{"S":"SESSION#load-test-session"}}' \
     --projection-expression "PK,SK"
   ```

### Issue: WebSocket Connection Refused

**Symptoms**: "Connection refused" or "ECONNREFUSED" errors

**Possible Causes**:
- WebSocket API not deployed
- Incorrect WebSocket URL
- Lambda Authorizer rejecting connections

**Solutions**:
1. Verify WebSocket API is deployed:
   ```bash
   cd terraform
   terraform output websocket_stage_url
   ```

2. Check Lambda Authorizer logs:
   ```bash
   aws logs tail /aws/lambda/websocket-authorizer --follow
   ```

3. Verify session tokens are valid

### Issue: 403 Forbidden on WebSocket Connection

**Symptoms**: WebSocket connections fail with 403 status code

**Possible Causes**:
- JWT_SECRET mismatch between test and authorizer
- Invalid JWT token format
- Session not found in DynamoDB
- Session expired

**Solutions**:
1. Verify JWT_SECRET matches authorizer:
   ```bash
   # Check authorizer Lambda environment variable
   aws lambda get-function-configuration \
     --function-name websocket-authorizer \
     --query 'Environment.Variables.JWT_SECRET'
   
   # Set matching secret in test environment
   export JWT_SECRET="your-secret-key"
   ```

2. Check authorizer logs for specific error:
   ```bash
   aws logs tail /aws/lambda/websocket-authorizer --follow
   ```

3. Verify session exists in DynamoDB:
   ```bash
   aws dynamodb get-item \
     --table-name chatbot-sessions \
     --key '{"PK":{"S":"SESSION#your-session-id"},"SK":{"S":"SESSION#your-session-id"}}'
   ```

4. Ensure test generates valid JWT tokens (the load test now uses `jsonwebtoken` library)

## Performance Benchmarks

### Expected Results (Healthy System)

| Metric | Target | Typical |
|--------|--------|---------|
| Connection Success Rate | ≥80% | 90-95% |
| Connection Responsive Rate | ≥90% | 95-98% |
| Chat Request Success Rate | ≥80% | 85-95% |
| Response Time (P50) | <2000ms | 1200-1500ms |
| Response Time (P95) | <2000ms | 1600-1900ms |
| Response Time (P99) | <2000ms | 1800-2000ms |

### Performance Degradation Indicators

- Connection success rate <80%: Lambda scaling issues
- Response time P95 >2000ms: Bedrock throttling or OpenSearch performance
- Connection responsive rate <90%: WebSocket connection instability

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-2
      
      - name: Install Dependencies
        run: |
          cd lambda/tests/integration
          npm install
      
      - name: Run Load Tests
        run: |
          cd lambda/tests/integration
          npm test load-concurrent-users.test.ts
        env:
          AWS_REGION: us-east-2
      
      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: lambda/tests/integration/test-results/
```

## Best Practices

### 1. Run During Off-Peak Hours

Load tests generate significant traffic. Run during off-peak hours to avoid impacting production users.

### 2. Monitor AWS Costs

Load tests invoke Bedrock API and other AWS services. Monitor costs:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-02 \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### 3. Use Separate Test Environment

Run load tests in a dedicated test environment to avoid impacting production:

```bash
cd terraform
terraform workspace new load-test
terraform apply -var="environment=load-test"
```

### 4. Gradual Ramp-Up

For initial testing, start with fewer concurrent users:

```bash
export CONCURRENT_USERS=25
npm test load-concurrent-users.test.ts

export CONCURRENT_USERS=50
npm test load-concurrent-users.test.ts

export CONCURRENT_USERS=100
npm test load-concurrent-users.test.ts
```

### 5. Analyze CloudWatch Metrics

After load tests, analyze CloudWatch metrics:

- Lambda concurrent executions
- Lambda duration
- Lambda errors
- Bedrock throttling
- OpenSearch query latency
- DynamoDB consumed capacity

## Next Steps

After successful load tests:

1. **Document Results**: Record baseline performance metrics
2. **Set Up Monitoring**: Configure CloudWatch alarms for performance degradation
3. **Optimize**: Address any performance bottlenecks identified
4. **Automate**: Integrate load tests into CI/CD pipeline
5. **Scale Testing**: Test with higher concurrency (200, 500 users)

## Related Documentation

- [E2E Test Guide](./E2E_TEST_GUIDE.md)
- [Error Resilience Test Guide](./ERROR_RESILIENCE_TEST_GUIDE.md)
- [Integration Verification](./INTEGRATION_VERIFICATION.md)
- [Backend Integration Tests](./README.md)

## Support

For issues or questions:

1. Check CloudWatch Logs for Lambda functions
2. Review Terraform outputs for correct configuration
3. Verify AWS credentials and permissions
4. Consult the troubleshooting section above
