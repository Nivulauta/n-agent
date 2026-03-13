# Test Configuration Update Summary

## Changes Made

All integration test files have been updated to use the centralized Terraform configuration loader.

## Updated Files

### 1. error-resilience.test.ts ✅
- Imports `getTestConfig` and `displayTestConfig`
- Uses `const TEST_CONFIG = getTestConfig()`
- Displays configuration in `beforeAll()` hook

### 2. e2e-user-flow.test.ts ✅
- Imports `getTestConfig` and `displayTestConfig`
- Uses `const TEST_CONFIG = { ...getTestConfig(), ... }` to merge with E2E-specific config
- Displays configuration in `beforeAll()` hook
- Maintains E2E-specific properties:
  - `apiUrl`
  - `wsUrl`
  - `processingTimeout`
  - `websocketStabilityDuration`
  - `testTimeout` (overridden to 120000ms)

### 3. backend-integration.test.ts ✅
- Imports `getTestConfig` and `displayTestConfig`
- Uses `const TEST_CONFIG = getTestConfig()`
- Displays configuration in `beforeAll()` hook

### 4. rag-pipeline.test.ts ✅
- Imports `getTestConfig` and `displayTestConfig`
- Uses `const TEST_CONFIG = getTestConfig()`
- Displays configuration in `beforeAll()` hook

## Configuration Loading

All tests now load configuration in this priority order:

1. **Terraform outputs** (via `terraform output -json` command)
2. **Environment variables**
3. **Default values**

## Default Region

Changed from `us-east-1` to `us-east-2` in `load-terraform-config.ts`

## Benefits

✅ **Consistency** - All tests use the same configuration method  
✅ **Automatic** - Configuration loads from Terraform without manual setup  
✅ **Flexible** - Falls back to environment variables or defaults  
✅ **Debuggable** - Configuration is displayed at test start  
✅ **Maintainable** - Single source of truth for configuration  

## Running Tests

All tests now work the same way:

```bash
# Option 1: Automatic (Terraform outputs)
cd terraform && terraform apply
cd ../lambda/tests/integration
npm test

# Option 2: Environment variables
export DOCUMENTS_BUCKET=my-bucket
export DOCUMENT_METADATA_TABLE=my-table
npm test

# Option 3: Defaults (local development)
npm test
```

## Test Output

When tests run, you'll see:

```
✓ Loaded configuration from terraform output command
Using configuration from Terraform outputs

Test Configuration:
==================
  AWS Region: us-east-2
  Documents Bucket: dev-chatbot-documents-177981160483
  Document Metadata Table: dev-chatbot-document-metadata
  Sessions Table: dev-chatbot-sessions
  Chat History Table: dev-chatbot-chat-history
  Rate Limits Table: dev-chatbot-rate-limits
  Connections Table: dev-chatbot-connections
  OpenSearch Endpoint: vpc-dev-chatbot-opensearch-xyz.us-east-2.es.amazonaws.com
  Redis Endpoint: dev-chatbot-redis.abc123.0001.use2.cache.amazonaws.com:6379
  REST API URL: http://localhost:3000
  WebSocket API URL: ws://localhost:3001
  Test Timeout: 60000ms
==================
```

## Next Steps

1. Run tests to verify configuration loads correctly
2. Check that Terraform outputs are available: `cd terraform && terraform output`
3. Review test output to confirm correct resource names are being used

## Related Documentation

- [README.md](./README.md) - Complete integration test guide
- [TERRAFORM_CONFIG_SETUP.md](./TERRAFORM_CONFIG_SETUP.md) - Configuration details
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions
- [QUICK_FIX.md](./QUICK_FIX.md) - Quick solutions for common errors
