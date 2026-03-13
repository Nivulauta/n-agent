# Changelog

## [1.1.0] - 2024-12-XX

### Changed
- **BREAKING**: Changed k-NN engine from `nmslib` to `lucene` for OpenSearch 3.0+ compatibility
  - `nmslib` is deprecated in OpenSearch 3.0+ and cannot be used for new index creation
  - `lucene` is the native OpenSearch engine with similar performance characteristics
  - No changes required to query API or application code

### Migration
- See [OPENSEARCH_3_MIGRATION.md](./OPENSEARCH_3_MIGRATION.md) for detailed migration guide
- Existing indices with `nmslib` continue to work in read-only mode
- New indices must use `lucene` or `faiss` engine

### Requirements
- OpenSearch >= 3.0 (previously supported 2.x)
- No other dependency changes

## [1.0.0] - 2024-12-XX

### Added
- Initial release
- OpenSearch index initialization with k-NN configuration
- HNSW algorithm support
- 1024-dimension vector support for Titan Embeddings V2
- Metadata fields for document tracking
- Idempotent index creation
- Comprehensive error handling
- CloudWatch logging
- VPC support
- IAM authentication

### Configuration
- Vector dimensions: 1024
- Algorithm: HNSW
- Engine: nmslib (deprecated in 3.0+)
- Similarity metric: Cosine
- ef_construction: 512
- m: 16
- ef_search: 512
- Refresh interval: 5s
- Shards: 3
- Replicas: 1
