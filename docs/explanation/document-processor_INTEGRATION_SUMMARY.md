# Document Processor to Embedding Generator Integration

## Overview

This document describes the integration between the Document Processor and Embedding Generator, implementing Task 11.1 of the AWS Claude RAG Chatbot specification.

## Architecture

```
S3 Upload Event
    ↓
Document Processor Lambda (Python)
    ├─ Extract text from PDF
    ├─ Chunk text (512 tokens, 50 overlap)
    ├─ Store chunks in S3
    └─ Invoke Embedding Generator Lambda (async)
        ↓
Embedding Generator Lambda (TypeScript)
    ├─ Download chunks from S3
    ├─ Generate embeddings (Bedrock Titan)
    └─ Return embeddings (for Vector Store indexing in task 11.2)
```

## Components

### 1. Document Processor (`extract-text/index.py`)

**Changes Made:**
- Added `lambda_client` initialization
- Added `EMBEDDING_GENERATOR_LAMBDA` environment variable
- Modified `store_chunks()` to return the S3 key
- Added `invoke_embedding_generator()` function
- Updated `extract_text()` to invoke embedding generator after chunking

**Key Function:**
```python
def invoke_embedding_generator(bucket: str, document_id: str, chunks_key: str) -> None:
    """
    Invoke the Embedding Generator Lambda function asynchronously.
    """
    payload = {
        'bucket': bucket,
        'documentId': document_id,
        'chunksKey': chunks_key
    }
    
    lambda_client.invoke(
        FunctionName=EMBEDDING_GENERATOR_LAMBDA,
        InvocationType='Event',  # Asynchronous
        Payload=json.dumps(payload)
    )
```

### 2. Embedding Generator (`generate-embeddings/src/index.ts`)

**New Lambda Function:**
- Downloads chunks from S3
- Generates embeddings using shared embeddings module
- Processes chunks in batches of 25
- Includes progress tracking
- Returns embeddings with metadata

**Key Features:**
- Uses Amazon Bedrock Titan Embeddings V2 (1024 dimensions)
- Batch processing with retry logic
- Preserves chunk metadata (page numbers, document info)
- Asynchronous invocation for non-blocking processing

## Data Flow

### Input to Document Processor
```json
{
  "Records": [{
    "s3": {
      "bucket": { "name": "chatbot-documents" },
      "object": { "key": "uploads/doc-id/file.pdf" }
    }
  }]
}
```

### Document Processor → Embedding Generator
```json
{
  "bucket": "chatbot-documents",
  "documentId": "doc-id",
  "chunksKey": "processed/doc-id/chunks.json"
}
```

### Chunks Format (S3)
```json
{
  "chunks": [
    {
      "chunkId": "doc-id#chunk#0",
      "documentId": "doc-id",
      "text": "chunk text...",
      "chunkIndex": 0,
      "pageNumber": 1,
      "tokenCount": 512,
      "metadata": {
        "filename": "file.pdf",
        "uploadedBy": "user-id",
        "uploadedAt": 1234567890,
        "pageCount": 10
      }
    }
  ],
  "totalChunks": 42,
  "chunkedAt": 1234567890
}
```

### Embedding Generator Output
```json
{
  "statusCode": 200,
  "body": {
    "documentId": "doc-id",
    "embeddingsCount": 42,
    "embeddings": [
      {
        "chunkId": "doc-id#chunk#0",
        "documentId": "doc-id",
        "embedding": [0.123, 0.456, ...],
        "text": "chunk text...",
        "chunkIndex": 0,
        "pageNumber": 1,
        "metadata": { ... }
      }
    ]
  }
}
```

## Requirements Validated

- **Requirement 5.5**: Document processing triggers embedding generation
- **Requirement 6.1**: Embeddings generated using Amazon Bedrock Titan Embeddings

## Environment Variables

### Document Processor
- `EMBEDDING_GENERATOR_LAMBDA`: Name/ARN of the Embedding Generator Lambda

### Embedding Generator
- `AWS_REGION`: AWS region for Bedrock API (default: us-east-1)

## IAM Permissions

### Document Processor Role
```json
{
  "Effect": "Allow",
  "Action": ["lambda:InvokeFunction"],
  "Resource": "arn:aws:lambda:*:*:function:*-generate-embeddings"
}
```

### Embedding Generator Role
```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::*/processed/*"
},
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1"
}
```

## Error Handling

### Document Processor
- Logs error if embedding generator invocation fails
- Does NOT fail document processing if embedding generation fails
- Document remains searchable by text even without embeddings

### Embedding Generator
- Implements retry logic with exponential backoff
- Handles Bedrock throttling errors
- Logs detailed error information to CloudWatch

## Performance Considerations

### Asynchronous Invocation
- Document Processor doesn't wait for embedding generation
- Faster document processing completion
- Better user experience (document marked as "processed" sooner)

### Batch Processing
- Processes 25 chunks in parallel
- Optimizes Bedrock API usage
- Reduces overall processing time

### Timeout Settings
- Document Processor: 300 seconds (5 minutes)
- Embedding Generator: 300 seconds (5 minutes)
- Sufficient for documents with 100+ chunks

## Monitoring

### CloudWatch Metrics
- Document Processor invocations
- Embedding Generator invocations
- Bedrock API calls
- Processing duration
- Error rates

### CloudWatch Logs
- Document processing logs: `/aws/lambda/dev-document-processor`
- Embedding generation logs: `/aws/lambda/dev-generate-embeddings`

## Testing

### Unit Tests
- Document Processor: `test_index.py`
- Embedding Generator: `src/index.test.ts`

### Integration Testing
1. Upload a test PDF to S3 uploads/ folder
2. Verify Document Processor extracts and chunks text
3. Verify Embedding Generator is invoked
4. Check CloudWatch Logs for both functions
5. Verify embeddings are generated (check logs)

## Next Steps

**Task 11.2**: Wire Embedding Generator to Vector Store
- Index embeddings in OpenSearch
- Update DocumentMetadata table with completion status
- Enable semantic search for the document

## Files Created/Modified

### Created
- `lambda/document-processor/generate-embeddings/src/index.ts`
- `lambda/document-processor/generate-embeddings/package.json`
- `lambda/document-processor/generate-embeddings/tsconfig.json`
- `lambda/document-processor/generate-embeddings/README.md`
- `lambda/document-processor/generate-embeddings/DEPLOYMENT.md`
- `lambda/document-processor/generate-embeddings/build.sh`
- `lambda/document-processor/generate-embeddings/terraform.tf`
- `lambda/document-processor/generate-embeddings/.gitignore`
- `lambda/document-processor/generate-embeddings/src/index.test.ts`
- `lambda/document-processor/INTEGRATION_SUMMARY.md`

### Modified
- `lambda/document-processor/extract-text/index.py`
  - Added Lambda client initialization
  - Added EMBEDDING_GENERATOR_LAMBDA environment variable
  - Modified store_chunks() to return S3 key
  - Added invoke_embedding_generator() function
  - Updated extract_text() to invoke embedding generator

## Deployment Checklist

- [ ] Build shared embeddings module
- [ ] Build embedding generator Lambda
- [ ] Deploy embedding generator Lambda via Terraform
- [ ] Update document processor environment variables
- [ ] Grant document processor permission to invoke embedding generator
- [ ] Test with sample PDF upload
- [ ] Verify CloudWatch Logs
- [ ] Monitor for errors
