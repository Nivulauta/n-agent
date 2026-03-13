# Embedding Generator to Vector Store Integration

## Overview

This document describes the integration between the Embedding Generator and Vector Store, implementing Task 11.2 of the AWS Claude RAG Chatbot specification. After embeddings are generated, they are automatically indexed in OpenSearch and the DocumentMetadata table is updated with completion status.

## Architecture

```
Document Processor Lambda
    ↓ (invokes)
Embedding Generator Lambda
    ├─ Download chunks from S3
    ├─ Generate embeddings (Bedrock Titan)
    ├─ Index embeddings in OpenSearch
    └─ Update DocumentMetadata table
        ↓
Document is searchable via semantic search
```

## Implementation Details

### 1. Embedding Generator Lambda Updates

**File**: `lambda/document-processor/generate-embeddings/src/index.ts`

**Key Changes**:
- Added OpenSearch client initialization
- Added DynamoDB client for DocumentMetadata updates
- Modified handler to store embeddings in OpenSearch after generation
- Added `updateDocumentMetadata()` function to update completion status
- Added error handling to update status to 'failed' on errors

**New Dependencies**:
- `@aws-sdk/client-dynamodb` - For updating DocumentMetadata table
- Shared vector-store module - For OpenSearch operations

### 2. Data Flow

#### Step 1: Generate Embeddings
```typescript
const embeddingsWithMetadata = await generateEmbeddingsForChunks(chunks);
```

#### Step 2: Transform to OpenSearch Format
```typescript
const embeddings: Embedding[] = embeddingsWithMetadata.map(e => ({
    chunkId: e.chunkId,
    vector: e.embedding,
    text: e.text,
    metadata: {
        documentId: e.documentId,
        documentName: e.metadata.filename,
        pageNumber: e.pageNumber,
        chunkIndex: e.chunkIndex,
        uploadedAt: e.metadata.uploadedAt,
        uploadedBy: e.metadata.uploadedBy,
    }
}));
```

#### Step 3: Batch Index in OpenSearch
```typescript
await vectorStore.batchIndexEmbeddings(embeddings);
```

#### Step 4: Update DocumentMetadata Table
```typescript
await updateDocumentMetadata(documentId, chunks.length, 'completed');
```

### 3. DocumentMetadata Update

The `updateDocumentMetadata()` function updates the following fields:
- `processingStatus`: Set to 'completed' or 'failed'
- `chunkCount`: Number of chunks processed
- `errorMessage`: Error details (only if status is 'failed')

**DynamoDB Update**:
```typescript
{
    TableName: DOCUMENT_METADATA_TABLE,
    Key: {
        PK: { S: `DOC#${documentId}` },
        SK: { S: 'METADATA' }
    },
    UpdateExpression: 'SET processingStatus = :status, chunkCount = :chunkCount',
    ExpressionAttributeValues: {
        ':status': { S: 'completed' },
        ':chunkCount': { N: '42' }
    }
}
```

### 4. Environment Variables

The Lambda function requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENSEARCH_ENDPOINT` | OpenSearch domain endpoint (without https://) | `vpc-chatbot-xyz.us-east-1.es.amazonaws.com` |
| `OPENSEARCH_INDEX` | Index name for documents | `documents` |
| `DOCUMENT_METADATA_TABLE` | DynamoDB table name | `dev-chatbot-document-metadata` |

### 5. IAM Permissions

The Lambda execution role requires the following permissions:

**OpenSearch**:
```json
{
    "Effect": "Allow",
    "Action": [
        "es:ESHttpPost",
        "es:ESHttpPut"
    ],
    "Resource": "arn:aws:es:*:*:domain/*"
}
```

**DynamoDB**:
```json
{
    "Effect": "Allow",
    "Action": [
        "dynamodb:UpdateItem"
    ],
    "Resource": "arn:aws:dynamodb:*:*:table/document-metadata-table"
}
```

**VPC Execution** (required for OpenSearch in VPC):
```json
{
    "Effect": "Allow",
    "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
    ],
    "Resource": "*"
}
```

### 6. VPC Configuration

Since OpenSearch is deployed in a VPC, the Lambda function must also be deployed in the same VPC:

**Terraform Configuration**:
```hcl
resource "aws_lambda_function" "generate_embeddings" {
  # ... other configuration ...
  
  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }
}
```

**Security Group Requirements**:
- Lambda security group must allow outbound traffic to OpenSearch security group on port 443
- OpenSearch security group must allow inbound traffic from Lambda security group on port 443

## Error Handling

### Success Case
1. Embeddings generated successfully
2. Embeddings indexed in OpenSearch
3. DocumentMetadata updated with `status=completed` and `chunkCount=N`
4. Lambda returns 200 status code

### Failure Case
1. Error occurs during embedding generation or indexing
2. Error is logged to CloudWatch
3. DocumentMetadata updated with `status=failed` and `errorMessage`
4. Lambda throws error (will be retried by AWS Lambda if configured)

## Testing

### Unit Testing
```bash
cd lambda/document-processor/generate-embeddings
npm test
```

### Integration Testing
1. Upload a test PDF to S3 `uploads/` folder
2. Verify Document Processor extracts and chunks text
3. Verify Embedding Generator is invoked
4. Check CloudWatch Logs for both functions
5. Verify embeddings are indexed in OpenSearch:
   ```bash
   curl -X GET "https://<opensearch-endpoint>/documents/_search?pretty"
   ```
6. Verify DocumentMetadata table is updated:
   ```bash
   aws dynamodb get-item \
     --table-name <table-name> \
     --key '{"PK":{"S":"DOC#<document-id>"},"SK":{"S":"METADATA"}}'
   ```

## Performance Considerations

### Batch Indexing
- Uses OpenSearch bulk API for efficient indexing
- Processes all embeddings in a single request
- Reduces network overhead and improves throughput

### VPC Cold Start
- Lambda functions in VPC have longer cold start times (~10-15 seconds)
- Consider using provisioned concurrency for latency-sensitive workloads
- First invocation after deployment will be slower

### Memory and Timeout
- Memory: 1024 MB (sufficient for most documents)
- Timeout: 300 seconds (5 minutes)
- Adjust based on document size and chunk count

## Monitoring

### CloudWatch Metrics
- Lambda invocations
- Lambda duration
- Lambda errors
- DynamoDB UpdateItem operations
- OpenSearch indexing operations

### CloudWatch Logs
- Embedding generation progress
- OpenSearch indexing results
- DocumentMetadata update confirmations
- Error details and stack traces

### Key Log Messages
```
Generate Embeddings Lambda triggered
Downloaded N chunks
Embedding progress: X/Y (Z%)
Generated N embeddings
Indexing N embeddings in OpenSearch...
Successfully indexed embeddings in OpenSearch
Updating DocumentMetadata table for document <id>...
Successfully updated DocumentMetadata table
Updated DocumentMetadata: <id> -> completed (N chunks)
```

## Requirements Validated

- **Requirement 6.3**: Embeddings stored in Vector Store with document metadata
- **Requirement 6.4**: Embedding Generator associates each embedding with source document ID and page number
- **Requirement 5.5**: Document processing triggers embedding generation (Task 11.1)
- **Requirement 6.1**: Embeddings generated using Amazon Bedrock Titan Embeddings (Task 11.1)

## Deployment

### Build Lambda
```bash
cd lambda/document-processor/generate-embeddings
npm install
npm run build
```

### Deploy Infrastructure
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Verify Deployment
```bash
# Check Lambda function exists
aws lambda get-function --function-name <env>-chatbot-generate-embeddings

# Check environment variables
aws lambda get-function-configuration \
  --function-name <env>-chatbot-generate-embeddings \
  --query 'Environment.Variables'

# Check VPC configuration
aws lambda get-function-configuration \
  --function-name <env>-chatbot-generate-embeddings \
  --query 'VpcConfig'
```

## Troubleshooting

### Issue: Lambda timeout
**Cause**: Document has too many chunks or OpenSearch is slow
**Solution**: Increase Lambda timeout or optimize batch size

### Issue: OpenSearch connection timeout
**Cause**: Lambda not in VPC or security group misconfigured
**Solution**: Verify VPC configuration and security group rules

### Issue: DynamoDB UpdateItem fails
**Cause**: Missing IAM permissions or incorrect table name
**Solution**: Verify IAM role has `dynamodb:UpdateItem` permission

### Issue: Embeddings not searchable
**Cause**: OpenSearch index not created or mapping incorrect
**Solution**: Run vector store init Lambda to create index

## Next Steps

**Task 12**: Implement Upload Handler
- Create document upload endpoint
- Generate presigned URLs for S3 upload
- Create document list and delete endpoints

**Task 13**: Implement Query Router
- Classify queries to determine if RAG retrieval is needed
- Implement dynamic k selection for search

**Task 14**: Implement RAG System
- Orchestrate document retrieval and context assembly
- Integrate with Bedrock Service for response generation
