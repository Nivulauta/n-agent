# RAG Orchestration Module

This module provides the RAG (Retrieval-Augmented Generation) orchestration functionality for the Nivulauta Agent system. It coordinates embedding generation, caching, and vector search to retrieve relevant document chunks for user queries.

## Features

- **Query Embedding Generation**: Generates embeddings for user queries using Amazon Bedrock Titan Embeddings
- **Intelligent Caching**: Caches search results for 15 minutes to reduce API calls and improve performance
- **Vector Search**: Searches OpenSearch for the most relevant document chunks using k-NN similarity
- **Graceful Degradation**: Continues to function even if cache is unavailable
- **Performance Monitoring**: Logs timing information for each operation

## Requirements

This module implements the following requirements:
- **7.1**: Generate query embeddings and retrieve relevant document chunks
- **7.2**: Perform k-nearest neighbor search in Vector Store
- **12.2**: Cache search results for identical query embeddings

## Installation

```bash
npm install
npm run build
```

## Usage

### Basic Usage

```typescript
import { RAGSystem } from 'rag';

// Initialize RAG system
const rag = new RAGSystem({
    region: 'us-east-1',
    opensearchEndpoint: 'https://your-opensearch-endpoint.amazonaws.com',
    cacheHost: 'your-redis-host',
    cachePort: 6379,
    cachePassword: 'your-redis-password',
    cacheTls: true
});

// Connect to cache
await rag.initialize();

// Retrieve relevant context for a query
const result = await rag.retrieveContext('What is the company policy on remote work?', {
    k: 5 // Retrieve top 5 chunks
});

console.log(`Found ${result.chunks.length} relevant chunks`);
console.log(`From cache: ${result.fromCache}`);

// Process chunks
for (const chunk of result.chunks) {
    console.log(`Document: ${chunk.documentName}, Page: ${chunk.pageNumber}`);
    console.log(`Score: ${chunk.score}`);
    console.log(`Text: ${chunk.text.substring(0, 100)}...`);
}

// Cleanup
await rag.disconnect();
```

### With Filters

```typescript
// Retrieve context with metadata filters
const result = await rag.retrieveContext('What are the Q4 sales figures?', {
    k: 10,
    filters: {
        documentIds: ['doc-123', 'doc-456'],
        dateRange: {
            start: Date.now() - 90 * 24 * 60 * 60 * 1000, // Last 90 days
            end: Date.now()
        }
    }
});
```

### Without Cache

```typescript
// Initialize without cache (cache will be disabled)
const rag = new RAGSystem({
    region: 'us-east-1',
    opensearchEndpoint: 'https://your-opensearch-endpoint.amazonaws.com'
});

await rag.initialize();

// Retrieve context (will always query vector store)
const result = await rag.retrieveContext('What is the refund policy?');
```

### Generate Query Embedding Only

```typescript
// Generate embedding without performing search
const embedding = await rag.generateQueryEmbedding('What is the return policy?');
console.log(`Embedding dimensions: ${embedding.length}`);
```

## API Reference

### RAGSystem

#### Constructor

```typescript
constructor(config: RAGConfig)
```

**Parameters:**
- `config.region` (optional): AWS region (default: 'us-east-1')
- `config.opensearchEndpoint` (required): OpenSearch endpoint URL
- `config.cacheHost` (optional): Redis cache host
- `config.cachePort` (optional): Redis cache port
- `config.cachePassword` (optional): Redis password
- `config.cacheTls` (optional): Enable TLS for Redis connection

#### Methods

##### initialize()

```typescript
async initialize(): Promise<void>
```

Initializes the RAG system and connects to cache if configured.

##### retrieveContext()

```typescript
async retrieveContext(query: string, options?: RetrievalOptions): Promise<RetrievalResult>
```

Retrieves relevant document chunks for a query.

**Parameters:**
- `query`: The user query text
- `options.k` (optional): Number of chunks to retrieve (default: 5)
- `options.filters` (optional): Search filters (documentIds, dateRange, metadata)

**Returns:**
- `chunks`: Array of relevant document chunks
- `fromCache`: Whether results were retrieved from cache
- `queryEmbedding`: The generated query embedding vector

##### generateQueryEmbedding()

```typescript
async generateQueryEmbedding(query: string): Promise<number[]>
```

Generates an embedding for a query without performing search.

##### disconnect()

```typescript
async disconnect(): Promise<void>
```

Disconnects from cache and cleans up resources.

##### isCacheAvailable()

```typescript
isCacheAvailable(): boolean
```

Checks if cache is available and connected.

## Types

### RAGConfig

```typescript
interface RAGConfig {
    region?: string;
    opensearchEndpoint: string;
    cacheHost?: string;
    cachePort?: number;
    cachePassword?: string;
    cacheTls?: boolean;
}
```

### RetrievalOptions

```typescript
interface RetrievalOptions {
    k?: number;
    filters?: {
        documentIds?: string[];
        dateRange?: { start: number; end: number };
        metadata?: Record<string, any>;
    };
}
```

### RetrievalResult

```typescript
interface RetrievalResult {
    chunks: DocumentChunk[];
    fromCache: boolean;
    queryEmbedding: number[];
}
```

### DocumentChunk

```typescript
interface DocumentChunk {
    chunkId: string;
    documentId: string;
    documentName: string;
    pageNumber: number;
    text: string;
    score: number;
    metadata: Record<string, any>;
}
```

## Performance

The RAG system is optimized for performance:

- **Query Embedding**: ~100-200ms (Bedrock Titan Embeddings)
- **Cache Lookup**: ~5-10ms (Redis)
- **Vector Search**: ~50-200ms (OpenSearch k-NN)
- **Total (cache hit)**: ~5-10ms
- **Total (cache miss)**: ~150-400ms

Cache hit rate typically ranges from 30-50% for typical usage patterns.

## Error Handling

The module implements graceful error handling:

- **Cache Unavailable**: Continues without cache, always queries vector store
- **Embedding Generation Failure**: Retries up to 3 times with exponential backoff
- **Vector Search Failure**: Throws error (caller should handle)

## Dependencies

- `embeddings`: Embedding generation using Bedrock Titan
- `vector-store`: OpenSearch vector storage and search
- `cache`: Redis caching layer

## Building

```bash
npm run build
```

This will:
1. Compile TypeScript to JavaScript (ES modules)
2. Copy local dependencies to dist/node_modules
3. Generate type declarations

## Testing

```bash
npm test
```

## Environment Variables

- `AWS_REGION`: AWS region for Bedrock and OpenSearch (default: us-east-1)

## Architecture

```
User Query
    ↓
RAGSystem.retrieveContext()
    ↓
1. Generate Query Embedding (Bedrock Titan)
    ↓
2. Check Cache (Redis)
    ↓ (cache miss)
3. Search Vector Store (OpenSearch k-NN)
    ↓
4. Cache Results (15 min TTL)
    ↓
Return Document Chunks
```

## License

MIT
