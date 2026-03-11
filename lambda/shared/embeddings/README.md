# Embedding Generator

AWS Bedrock Titan Embeddings generator for creating vector embeddings from text.

## Overview

This module provides a TypeScript client for generating vector embeddings using Amazon Bedrock's Titan Embeddings model (`amazon.titan-embed-text-v1`). It supports both single text embedding generation and batch processing with configurable batch sizes, parallel batch processing, and automatic retry logic for rate limiting.

## Features

- Generate 1024-dimension embeddings for single text inputs
- Batch processing with configurable batch size (default: 25)
- Parallel batch processing for improved throughput on large document sets
- Automatic retry logic with exponential backoff for rate limiting
- Progress tracking callbacks for large document sets
- Input validation and error handling
- TypeScript type definitions

## Installation

```bash
npm install
npm run build
```

## Usage

### Basic Usage

```typescript
import { EmbeddingGenerator } from './embeddings.js';

const generator = new EmbeddingGenerator();

// Generate single embedding
const result = await generator.generateEmbedding('Hello, world!');
console.log(result.embedding); // Array of 1024 numbers
console.log(result.inputTextTokenCount); // Token count
```

### Batch Processing

```typescript
const texts = [
    'First document chunk',
    'Second document chunk',
    'Third document chunk',
];

// Process with default batch size (25)
const batchResult = await generator.batchGenerateEmbeddings(texts);
console.log(batchResult.embeddings.length); // 3
console.log(batchResult.totalTokenCount); // Total tokens processed

// Process with custom batch size
const customBatchResult = await generator.batchGenerateEmbeddings(texts, 10);
```

### Batch Processing with Progress Tracking

```typescript
const texts = new Array(100).fill('Document chunk');

const result = await generator.batchGenerateEmbeddings(
    texts,
    25,
    (progress) => {
        console.log(`Progress: ${progress.percentage}% (${progress.processed}/${progress.total})`);
    }
);
```

### Parallel Batch Processing

For large document sets, use parallel batch processing to improve throughput:

```typescript
const texts = new Array(1000).fill('Document chunk');

// Process with 3 concurrent batches of 25 texts each
const result = await generator.parallelBatchGenerateEmbeddings(
    texts,
    25,  // batch size
    3,   // concurrent batches
    (progress) => {
        console.log(`Progress: ${progress.percentage}%`);
    }
);

console.log(result.embeddings.length); // 1000
console.log(result.totalTokenCount); // Total tokens processed
```

### Custom Configuration

```typescript
const generator = new EmbeddingGenerator({
    region: 'us-west-2',
    modelId: 'amazon.titan-embed-text-v1',
});
```

## API Reference

### `EmbeddingGenerator`

#### Constructor

```typescript
constructor(config?: EmbeddingConfig)
```

- `config.region` - AWS region (default: `process.env.AWS_REGION` or `'us-east-1'`)
- `config.modelId` - Bedrock model ID (default: `'amazon.titan-embed-text-v1'`)

#### Methods

##### `generateEmbedding(text: string): Promise<EmbeddingResult>`

Generate embedding for a single text input with automatic retry logic.

**Parameters:**
- `text` - The text to generate an embedding for (cannot be empty)

**Returns:**
- `embedding` - Array of 1024 numbers representing the vector
- `inputTextTokenCount` - Number of tokens in the input text (optional)

**Throws:**
- Error if text is empty or whitespace-only
- Error if Bedrock API call fails after retries
- Error if response format is invalid
- Error if embedding dimensions are not 1024

**Retry Logic:**
- Automatically retries on throttling errors (ThrottlingException, 429, 503)
- Uses exponential backoff: 1s, 2s, 4s
- Maximum 3 attempts

##### `batchGenerateEmbeddings(texts: string[], batchSize?: number, onProgress?: ProgressCallback): Promise<BatchEmbeddingResult>`

Generate embeddings for multiple text inputs in batches.

**Parameters:**
- `texts` - Array of texts to generate embeddings for (cannot be empty)
- `batchSize` - Number of texts to process in parallel (default: 25)
- `onProgress` - Optional callback for progress tracking

**Returns:**
- `embeddings` - Array of embedding vectors (each 1024 dimensions)
- `totalTokenCount` - Total tokens processed across all texts (optional)

**Throws:**
- Error if texts array is empty
- Error if batch size is less than 1
- Error if any individual embedding generation fails

##### `parallelBatchGenerateEmbeddings(texts: string[], batchSize?: number, concurrentBatches?: number, onProgress?: ProgressCallback): Promise<BatchEmbeddingResult>`

Generate embeddings with parallel batch processing for improved throughput.

**Parameters:**
- `texts` - Array of texts to generate embeddings for (cannot be empty)
- `batchSize` - Number of texts per batch (default: 25)
- `concurrentBatches` - Number of batches to process concurrently (default: 3)
- `onProgress` - Optional callback for progress tracking

**Returns:**
- `embeddings` - Array of embedding vectors in the same order as input texts
- `totalTokenCount` - Total tokens processed across all texts (optional)

**Throws:**
- Error if texts array is empty
- Error if batch size is less than 1
- Error if concurrent batches is less than 1
- Error if any individual embedding generation fails

**Performance:**
- Processes multiple batches concurrently using Promise.all
- Maintains correct order of embeddings
- Ideal for large document sets (100+ chunks)

## Testing

```bash
npm test
```

## Requirements

- Node.js 22+
- AWS credentials configured
- Access to Amazon Bedrock with Titan Embeddings model enabled

## Performance

- Single embedding generation: ~100-200ms per request
- Batch processing: Processes texts in parallel within each batch
- Parallel batch processing: Processes multiple batches concurrently
- Default batch size of 25 balances throughput and API rate limits
- With parallel processing (3 concurrent batches): Can process 300+ chunks per minute
- Automatic retry logic handles rate limiting gracefully

## Error Handling

The module includes comprehensive error handling:
- Input validation (empty text, invalid batch size)
- Automatic retry with exponential backoff for throttling errors
- API error propagation with descriptive messages
- Response validation (missing fields, wrong dimensions)
- Progress tracking for monitoring large operations

## Rate Limiting

The module handles rate limiting automatically:
- Detects throttling errors (ThrottlingException, 429, 503)
- Retries with exponential backoff (1s, 2s, 4s)
- Logs retry attempts for debugging
- Configurable concurrent batch processing to stay within limits
