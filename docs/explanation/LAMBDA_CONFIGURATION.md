# Lambda Concurrency and Scaling Configuration

This document summarizes the Lambda function concurrency limits, memory allocations, timeouts, and VPC networking configurations implemented for the AWS Claude RAG Chatbot system.

## Configuration Summary

### WebSocket Handlers

#### Connect Handler
- **Function**: `${environment}-websocket-connect`
- **Memory**: 1024 MB (increased from 256 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: 100 (supports 100 concurrent connections)
- **VPC**: Not required (DynamoDB access only)

#### Disconnect Handler
- **Function**: `${environment}-websocket-disconnect`
- **Memory**: 1024 MB (increased from 256 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: 100 (supports 100 concurrent disconnections)
- **VPC**: Not required (DynamoDB access only)

#### Message Handler
- **Function**: `${environment}-websocket-message`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: 100 (supports 100 concurrent message handlers)
- **VPC**: Yes (private subnets for OpenSearch and Redis access)
- **Security Groups**: Lambda security group with access to OpenSearch and ElastiCache

### Authentication Service

#### Lambda Authorizer
- **Function**: `${environment}-api-authorizer`
- **Memory**: 1024 MB (increased from 256 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (DynamoDB access only)

#### Login Handler
- **Function**: `${environment}-auth-login`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (DynamoDB access only)

#### Logout Handler
- **Function**: `${environment}-auth-logout`
- **Memory**: 1024 MB (increased from 256 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (DynamoDB access only)

### Document Management

#### Upload Handler
- **Function**: `${environment}-document-upload`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (S3 and DynamoDB access via VPC endpoints)

#### List Handler
- **Function**: `${environment}-document-list`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (DynamoDB access only)

#### Delete Handler
- **Function**: `${environment}-document-delete`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Yes (private subnets for OpenSearch access)
- **Security Groups**: Lambda security group with access to OpenSearch

### Document Processing

#### Document Processor
- **Function**: `${environment}-chatbot-document-processor`
- **Memory**: 3008 MB (high memory for PDF processing)
- **Timeout**: 300 seconds (5 minutes for large PDFs)
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (S3 and DynamoDB access via VPC endpoints)

#### Embedding Generator
- **Function**: `${environment}-chatbot-generate-embeddings`
- **Memory**: 1024 MB
- **Timeout**: 300 seconds (5 minutes for large documents)
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Yes (private subnets for OpenSearch access)
- **Security Groups**: Lambda security group with access to OpenSearch

### Chat History

#### Chat History Handler
- **Function**: `${environment}-chatbot-chat-history`
- **Memory**: 1024 MB (increased from 512 MB)
- **Timeout**: 30 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Not required (DynamoDB access only)

### Vector Store Management

#### Vector Store Init
- **Function**: `${environment}-vector-store-init-index`
- **Memory**: 512 MB
- **Timeout**: 60 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Yes (private subnets for OpenSearch access)
- **Security Groups**: Lambda security group with access to OpenSearch

#### OpenSearch Access Config
- **Function**: `${environment}-opensearch-configure-access`
- **Memory**: 512 MB
- **Timeout**: 60 seconds
- **Reserved Concurrency**: None (uses account default)
- **VPC**: Yes (private subnets for OpenSearch access)
- **Security Groups**: Lambda security group with access to OpenSearch

## VPC Networking Architecture

### Private Subnets
All Lambda functions requiring VPC access are deployed in private subnets with the following characteristics:
- Multiple availability zones for high availability
- NAT Gateway for outbound internet access (Bedrock API calls)
- VPC endpoints for S3, DynamoDB, and Bedrock to avoid internet routing

### Security Groups
Lambda functions in VPC use a dedicated security group with:
- Outbound access to OpenSearch cluster (port 443)
- Outbound access to ElastiCache Redis (port 6379)
- Outbound access to internet via NAT Gateway for Bedrock API calls

### Functions Requiring VPC Access
The following Lambda functions are attached to VPC:
1. **WebSocket Message Handler** - Needs OpenSearch and Redis access
2. **Document Delete Handler** - Needs OpenSearch access to delete embeddings
3. **Embedding Generator** - Needs OpenSearch access to index embeddings
4. **Vector Store Init** - Needs OpenSearch access to create indices
5. **OpenSearch Access Config** - Needs OpenSearch access to configure security

### Functions NOT Requiring VPC Access
The following Lambda functions do NOT need VPC access:
1. **Authentication handlers** (Authorizer, Login, Logout) - DynamoDB only
2. **WebSocket Connect/Disconnect** - DynamoDB only
3. **Document Upload/List** - S3 and DynamoDB via VPC endpoints
4. **Document Processor** - S3 and DynamoDB via VPC endpoints
5. **Chat History** - DynamoDB only

## Concurrency Strategy

### Reserved Concurrency
Reserved concurrency is set for WebSocket handlers to ensure:
- 100 concurrent WebSocket connections can be maintained
- Predictable performance during peak usage
- Protection against runaway costs from other Lambda functions

### Account-Level Concurrency
Other Lambda functions use the account-level concurrent execution limit, which provides:
- Flexibility for burst traffic
- Cost optimization (no idle reserved capacity)
- Automatic scaling based on demand

## Performance Considerations

### Memory Allocation
- **1024 MB** for most API handlers (balanced performance/cost)
- **3008 MB** for document processing (CPU-intensive PDF parsing)
- **512 MB** for utility functions (vector store init, access config)

### Timeout Configuration
- **30 seconds** for API handlers (meets <2s response time requirement with buffer)
- **300 seconds** for document processing (handles large PDFs up to 100MB)
- **60 seconds** for utility functions (one-time operations)

### Cold Start Mitigation
- Increased memory allocation (1024 MB) reduces cold start times
- Reserved concurrency for WebSocket handlers keeps functions warm
- VPC ENI caching reduces VPC cold start penalty

## Cost Optimization

### Memory vs. Cost Trade-off
- 1024 MB provides optimal balance of performance and cost
- Higher memory = faster execution = lower duration charges
- Reserved concurrency only for critical path (WebSocket handlers)

### VPC Optimization
- Only functions requiring OpenSearch/Redis access are in VPC
- VPC endpoints for S3/DynamoDB avoid NAT Gateway data transfer charges
- Shared security group reduces management overhead

## Monitoring and Scaling

### CloudWatch Metrics
All Lambda functions emit:
- Invocation count
- Duration
- Error count
- Throttles
- Concurrent executions

### Alarms
Configure CloudWatch alarms for:
- Concurrent executions approaching reserved limit (WebSocket handlers)
- Duration exceeding 2 seconds (API handlers)
- Error rate exceeding 5%
- Throttling events

### Scaling Limits
- **WebSocket handlers**: 100 reserved concurrent executions
- **Other functions**: Account-level limit (default 1000 concurrent executions)
- **OpenSearch**: 3-node cluster can handle 100+ concurrent queries
- **ElastiCache**: Single node can handle 100+ concurrent connections

## Deployment Notes

### Terraform Apply
After updating Lambda configurations, run:
```bash
cd terraform
terraform plan
terraform apply
```

### Validation
Verify configurations:
```bash
# Check reserved concurrency
aws lambda get-function-concurrency --function-name dev-websocket-message

# Check VPC configuration
aws lambda get-function-configuration --function-name dev-websocket-message | jq '.VpcConfig'

# Check memory and timeout
aws lambda get-function-configuration --function-name dev-websocket-message | jq '{MemorySize, Timeout}'
```

### Rollback
If issues occur, revert to previous configuration:
```bash
cd terraform
git checkout HEAD~1 -- modules/
terraform apply
```

## Requirements Validation

This configuration satisfies the following requirements:

### Requirement 9.1: Concurrent User Support
- Reserved concurrency of 100 for WebSocket handlers
- Memory allocation supports 100 concurrent users
- VPC networking configured for OpenSearch access

### Requirement 13.2: Infrastructure as Code
- All Lambda configurations defined in Terraform
- Memory, timeout, and concurrency settings codified
- VPC networking defined in modules

### Requirement 9.3: Response Time
- 30-second timeout provides buffer for <2s response requirement
- 1024 MB memory allocation ensures fast execution
- VPC ENI caching reduces latency

### Requirement 9.4: WebSocket Connections
- Reserved concurrency supports 100 simultaneous connections
- Message handler has sufficient memory for concurrent processing
- VPC configuration enables OpenSearch and Redis access

### Requirement 9.5: Bedrock API Concurrency
- NAT Gateway enables outbound Bedrock API calls from VPC
- No reserved concurrency allows flexible scaling
- Retry logic handles throttling

## Next Steps

1. Deploy updated Terraform configurations
2. Run load tests to validate 100 concurrent user support
3. Monitor CloudWatch metrics for performance validation
4. Adjust memory/concurrency based on actual usage patterns
5. Configure CloudWatch alarms for production monitoring
