# Chat History Store

Chat history persistence module for DynamoDB with KMS encryption.

## Features

- **DynamoDB Persistence**: Stores chat messages with composite key design (PK=userId#sessionId, SK=timestamp)
- **KMS Encryption**: Encrypts message content using AWS KMS before storage
- **Automatic TTL**: Messages automatically expire after 90 days
- **Performance**: Completes save operations within 1 second
- **Type Safety**: Full TypeScript support with comprehensive types

## Installation

```bash
npm install
npm run build
```

## Usage

### Basic Usage

```typescript
import { ChatHistoryStore } from './dist/index.mjs';

const store = new ChatHistoryStore({
    tableName: 'ChatHistory',
    region: 'us-east-1',
    kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    ttlDays: 90
});

// Save a message
await store.saveMessage({
    userId: 'user123',
    sessionId: 'session456',
    messageId: 'msg789',
    timestamp: Date.now(),
    role: 'user',
    content: 'Hello, how can you help me?',
    metadata: {
        tokenCount: 10
    }
});

// Retrieve conversation history
const result = await store.getHistory('user123', 'session456', 50);
console.log(`Retrieved ${result.messages.length} messages`);

// Retrieve with pagination
let allMessages = [];
let nextToken = undefined;
do {
    const result = await store.getHistory('user123', 'session456', 50, nextToken);
    allMessages.push(...result.messages);
    nextToken = result.nextToken;
} while (nextToken);
```

### Configuration

The module can be configured via constructor options or environment variables:

- `tableName`: DynamoDB table name (default: `CHAT_HISTORY_TABLE_NAME` env var or 'ChatHistory')
- `region`: AWS region (default: `AWS_REGION` env var or 'us-east-1')
- `kmsKeyId`: KMS key ID for encryption (required, from `KMS_KEY_ID` env var)
- `ttlDays`: Number of days before messages expire (default: 90)

## DynamoDB Table Schema

```typescript
interface ChatHistoryRecord {
    PK: string;      // "USER#<userId>#SESSION#<sessionId>"
    SK: number;      // timestamp
    messageId: string;
    role: 'user' | 'assistant';
    content: string; // Encrypted with KMS
    metadata: {
        retrievedChunks?: string[];
        tokenCount?: number;
        latency?: number;
        cached?: boolean;
    };
    ttl: number;     // Unix timestamp for automatic deletion
}
```

## Requirements Validation

This module validates the following requirements:

- **8.1**: Persists messages within 1 second of send/receive
- **8.2**: Associates each message with user session ID and timestamp
- **8.3**: Retrieves messages within 500ms with pagination support (limit and nextToken)
- **8.4**: Retains conversation history for 90 days (via TTL)
- **8.5**: Encrypts all stored messages using AES-256 encryption (via KMS)

## API Reference

### ChatHistoryStore

#### `saveMessage(message: ChatMessage): Promise<void>`

Saves a message to the chat history with encryption and TTL.

**Parameters:**
- `message`: ChatMessage object containing userId, sessionId, messageId, timestamp, role, content, and optional metadata

**Throws:**
- Error if KMS encryption fails
- Error if DynamoDB write fails

#### `getHistory(userId: string, sessionId: string, limit?: number, nextToken?: string): Promise<{ messages: ChatMessage[]; nextToken?: string }>`

Retrieves conversation history for a user session with pagination support.

**Parameters:**
- `userId`: User identifier
- `sessionId`: Session identifier
- `limit`: Maximum number of messages to retrieve (default: 50)
- `nextToken`: Optional pagination token from previous request

**Returns:**
- Object containing:
  - `messages`: Array of decrypted ChatMessage objects, sorted by most recent first
  - `nextToken`: Optional token for retrieving next page of results

**Performance:**
- Returns within 500ms (Requirement 8.3)

**Example:**
```typescript
// First page
const result = await store.getHistory('user123', 'session456', 50);

// Next page if available
if (result.nextToken) {
    const nextPage = await store.getHistory('user123', 'session456', 50, result.nextToken);
}
```

#### `deleteExpiredHistory(): Promise<void>`

Manual cleanup method (DynamoDB TTL handles automatic deletion).

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## License

MIT
