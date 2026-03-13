# OpenSearch Index Dimension Update Summary

## Changes Made

Updated the OpenSearch index configuration and all related modules to use **1024 dimensions** instead of **1536 dimensions** to match Amazon Titan Embeddings V2 output.

## Files Modified

### 1. Vector Store Init Index Lambda
**File**: `lambda/vector-store/init-index/src/index.ts`

**Changes**:
- Updated `dimension: 1536` → `dimension: 1024`
- Updated comments to reference Titan Embeddings V2

```typescript
embedding: {
    type: 'knn_vector',
    dimension: 1024,  // Changed from 1536
    method: {
        name: 'hnsw',
        space_type: 'cosinesimil',
        engine: 'lucene',
        parameters: {
            ef_construction: 512,
            m: 16
        }
    }
}
```

### 2. Shared Vector Store Module
**File**: `lambda/shared/vector-store/src/types.ts`

**Changes**:
- Updated comment: `vector: number[]; // 1024 dimensions (Titan Embeddings V2)`

**File**: `lambda/shared/vector-store/src/opensearch-client.ts`

**Changes**:
- Updated JSDoc: `@param queryVector - Query embedding vector (1024 dimensions)`
- Updated validation: `if (queryVector.length !== 1024)`
- Updated error message: `expected 1024, got ${queryVector.length}`

### 3. Shared Embeddings Module
**File**: `lambda/shared/embeddings/src/embeddings.ts`

**Changes**:
- Updated model ID: `amazon.titan-embed-text-v2:0`
- Updated JSDoc: `@returns EmbeddingResult containing the 1024-dimension vector (Titan V2)`
- Updated validation: `if (responseBody.embedding.length !== 1024)`
- Updated error message: `expected 1024, got ${responseBody.embedding.length}`

## Titan Embeddings V1 vs V2

| Feature | V1 | V2 |
|---------|----|----|
| Model ID | `amazon.titan-embed-text-v1` | `amazon.titan-embed-text-v2:0` |
| Dimensions | 1536 (fixed) | 256, 512, or 1024 (default: 1024) |
| Max Input Tokens | 8192 | 8192 |
| Availability | Limited regions | More regions |
| Performance | Good | Improved |

## Why 1024 Dimensions?

### Advantages
1. **Current Model**: Titan V2 is the latest and recommended version
2. **Better Performance**: Improved embedding quality
3. **Wider Availability**: Available in more AWS regions
4. **Smaller Storage**: 33% less storage space per vector (1024 vs 1536)
5. **Faster Search**: Slightly faster k-NN search with fewer dimensions

### Trade-offs
- **Slightly Less Granular**: Fewer dimensions means slightly less information capacity
- **Still Excellent**: 1024 dimensions is still very high-dimensional and provides excellent semantic search quality

## OpenSearch Index Configuration

### Complete Index Mapping
```json
{
  "mappings": {
    "properties": {
      "chunkId": { "type": "keyword" },
      "documentId": { "type": "keyword" },
      "documentName": { "type": "text" },
      "pageNumber": { "type": "integer" },
      "chunkIndex": { "type": "integer" },
      "text": { "type": "text" },
      "embedding": {
        "type": "knn_vector",
        "dimension": 1024,
        "method": {
          "name": "hnsw",
          "space_type": "cosinesimil",
          "engine": "lucene",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      },
      "uploadedAt": { "type": "date" },
      "uploadedBy": { "type": "keyword" }
    }
  },
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512,
      "refresh_interval": "5s",
      "number_of_shards": 3,
      "number_of_replicas": 1
    }
  }
}
```

## Deployment Steps

### 1. Delete Existing Index (if exists)

**Option A: Via AWS Console**
- Navigate to OpenSearch Dashboards
- Go to Dev Tools
- Run: `DELETE /documents`

**Option B: Via Lambda**
You can add a delete function to the init-index Lambda or use curl:
```bash
curl -X DELETE "https://<opensearch-endpoint>/documents"
```

### 2. Deploy Updated Lambda

```bash
# Build init-index Lambda
cd lambda/vector-store/init-index
npm run build

# Deploy via Terraform
cd terraform
terraform apply
```

### 3. Invoke Init Index Lambda

**Option A: Via AWS Console**
- Navigate to Lambda console
- Find the init-index Lambda
- Click "Test" with empty payload `{}`

**Option B: Via AWS CLI**
```bash
aws lambda invoke \
  --function-name <env>-chatbot-vector-store-init \
  --payload '{}' \
  --region us-east-1 \
  response.json

cat response.json
```

**Expected Response**:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

### 4. Deploy Generate Embeddings Lambda

```bash
cd lambda/document-processor/generate-embeddings
npm run build:lambda

cd terraform
terraform apply
```

### 5. Verify Index Configuration

```bash
curl -X GET "https://<opensearch-endpoint>/documents/_mapping?pretty"
```

Look for:
```json
{
  "documents": {
    "mappings": {
      "properties": {
        "embedding": {
          "type": "knn_vector",
          "dimension": 1024
        }
      }
    }
  }
}
```

## Testing

### 1. Upload a Test Document
Upload a PDF to trigger the document processing pipeline.

### 2. Check Embedding Generation
Monitor CloudWatch logs for the generate-embeddings Lambda:
```
Generated N embeddings
Successfully indexed embeddings in OpenSearch
```

### 3. Verify Vector Dimensions
Query OpenSearch to check a document:
```bash
curl -X GET "https://<opensearch-endpoint>/documents/_search?pretty" \
  -H 'Content-Type: application/json' \
  -d '{
    "size": 1,
    "query": { "match_all": {} }
  }'
```

Check that the `embedding` field has 1024 values.

### 4. Test Semantic Search
Try a search query to verify k-NN search works:
```bash
curl -X POST "https://<opensearch-endpoint>/documents/_search?pretty" \
  -H 'Content-Type: application/json' \
  -d '{
    "size": 5,
    "query": {
      "knn": {
        "embedding": {
          "vector": [/* 1024 dimension query vector */],
          "k": 5
        }
      }
    }
  }'
```

## Rollback Plan

If you need to rollback to 1536 dimensions:

### 1. Revert Code Changes
```bash
git revert <commit-hash>
```

### 2. Update Model ID
Change back to Titan V1:
```typescript
this.modelId = config.modelId || 'amazon.titan-embed-text-v1';
```

### 3. Update Dimension Validation
```typescript
if (responseBody.embedding.length !== 1536) {
    throw new Error(`Invalid embedding dimensions: expected 1536, got ${responseBody.embedding.length}`);
}
```

### 4. Rebuild and Redeploy
```bash
npm run build
terraform apply
```

### 5. Recreate Index
Delete and recreate the index with 1536 dimensions.

## Performance Impact

### Storage Savings
- **Per Vector**: 1024 floats × 4 bytes = 4,096 bytes (vs 6,144 bytes for 1536)
- **Savings**: ~33% reduction in storage per vector
- **Example**: 1 million vectors = ~2 GB savings

### Search Performance
- **Slightly Faster**: Fewer dimensions means faster distance calculations
- **Negligible Impact**: The difference is minimal for most use cases
- **HNSW Algorithm**: Still very efficient at 1024 dimensions

### Embedding Quality
- **Titan V2 Improvements**: Better quality despite fewer dimensions
- **Semantic Search**: Still excellent for document retrieval
- **Recommended**: AWS recommends V2 for new applications

## Status

✅ **Index Configuration Updated**: Now uses 1024 dimensions
✅ **Vector Store Module Updated**: Validates 1024 dimensions
✅ **Embeddings Module Updated**: Expects 1024 dimensions from Titan V2
✅ **All Modules Rebuilt**: Ready for deployment
⚠️ **Index Recreation Required**: Must delete and recreate OpenSearch index

## Next Steps

1. Delete existing OpenSearch index (if exists)
2. Deploy updated init-index Lambda
3. Invoke init-index Lambda to create new index
4. Deploy updated generate-embeddings Lambda
5. Test with document upload
6. Verify embeddings are 1024 dimensions
7. Test semantic search functionality

## References

- [Amazon Titan Embeddings V2](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
- [OpenSearch k-NN Plugin](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [HNSW Algorithm](https://arxiv.org/abs/1603.09320)
