# Cache Utility Module

Redis-based caching utility for Nivulauta Agent. Provides caching for Bedrock responses and OpenSearch search results to reduce API calls and improve performance.

## Features

- **Bedrock Response Caching**: Cache Claude responses with 1-hour TTL
- **Search Result Caching**: Cache OpenSearch results with 15-minute TTL
- **SHA-256 Hashing**: Secure query and embedding hashing for cache keys
- **Graceful Error Handling**: Returns cache miss on Redis errors (non-blocking)
- **Connection Management**: Automatic reconnection with exponential backoff

## Installation

```bash
npm install
npm run build
```

## Usage

### Initialize Cache

```typescript
import { CacheLayer } from './cache';

const cache = new CacheLayer({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
});

// Connect to Redis
await cache.connect();
```

### Cache Bedrock Responses

```typescript
// Check cache before calling Bedrock
const query = "What is the capital of France?";
const cachedResponse = await cache.getCachedResponse(query);

if (cachedResponse) {
  console.log('Cache hit:', cachedResponse);
} else {
  // Call Bedrock API
  const response = await bedrockService.generateResponse(query);
  
  // Store in cache (TTL: 3600s)
  await cache.setCachedResponse(query, response);
}
```

### Cache Search Results

```typescript
// Check cache before searching OpenSearch
const queryEmbedding = [0.1, 0.2, 0.3, ...]; // 1024 dimensions
const cachedResults = await cache.getCachedSearchResults(queryEmbedding);

if (cachedResults) {
  console.log('Cache hit:', cachedResults.length, 'chunks');
} else {
  // Search OpenSearch
  const results = await vectorStore.searchSimilar(queryEmbedding, 5);
  
  // Store in cache (TTL: 900s)
  await cache.setCachedSearchResults(queryEmbedding, results);
}
```

### Cleanup

```typescript
// Disconnect when done
await cache.disconnect();
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | required | Redis host address |
| `port` | number | required | Redis port |
| `password` | string | optional | Redis password |
| `tls` | boolean | optional | Enable TLS connection |
| `connectTimeout` | number | 5000 | Connection timeout in ms |
| `maxRetriesPerRequest` | number | 3 | Max retry attempts |

## TTL Configuration

- **Bedrock Responses**: 3600 seconds (1 hour)
- **Search Results**: 900 seconds (15 minutes)

## Error Handling

The cache utility implements graceful error handling:

- Redis connection errors are logged but don't throw exceptions
- Failed cache operations return `null` (cache miss)
- Application continues to function without caching if Redis is unavailable
- Automatic reconnection with exponential backoff (100ms, 200ms, 400ms)

## Cache Key Format

- **Bedrock responses**: `bedrock:<sha256(query)>`
- **Search results**: `search:<sha256(embedding_vector)>`

## Requirements Satisfied

- **12.1**: Cache Bedrock responses for identical queries (1 hour TTL)
- **12.2**: Cache Vector Store search results (15 minutes TTL)
- **12.3**: Return cached results without invoking external services
- **12.4**: LRU eviction policy (configured in Redis/ElastiCache)
- **12.5**: Target 30%+ cache hit rate

## Testing

```bash
npm test
```

## Building

```bash
npm run build
```

Output will be in the `dist/` directory.
