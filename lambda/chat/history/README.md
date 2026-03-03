# Chat History Endpoint Lambda

Lambda function for retrieving chat conversation history.

## Overview

This Lambda function implements the `GET /chat/history` endpoint that retrieves conversation history for a user session. It integrates with the chat history retrieval module which handles decryption and pagination.

**Validates Requirements: 8.3**

## API Specification

### Endpoint

```
GET /chat/history
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | Yes | Session identifier for the conversation |
| limit | number | No | Maximum number of messages to retrieve (default: 50, max: 100) |
| nextToken | string | No | Pagination token from previous request |

### Response

```typescript
{
  messages: Array<{
    userId: string;
    sessionId: string;
    messageId: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    metadata?: {
      retrievedChunks?: string[];
      tokenCount?: number;
      latency?: number;
    };
  }>;
  nextToken?: string;
}
```

### Status Codes

- `200` - Success
- `400` - Bad Request (missing sessionId)
- `401` - Unauthorized (invalid or missing authentication)
- `500` - Internal Server Error

## Features

- **Authentication**: Extracts userId from API Gateway authorizer context
- **Pagination**: Supports pagination with limit and nextToken parameters
- **Decryption**: Automatically decrypts message content using KMS
- **Performance**: Retrieves messages within 500ms (Requirement 8.3)
- **Ordering**: Returns messages in reverse chronological order (most recent first)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| CHAT_HISTORY_TABLE_NAME | DynamoDB table name for chat history | Yes |
| KMS_KEY_ID | KMS key ID for message decryption | Yes |
| AWS_REGION | AWS region | No (defaults to us-east-1) |

## Dependencies

- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client
- `@aws-sdk/client-kms` - KMS client for decryption
- `../../../shared/chat-history` - Chat history store module

## Building

```bash
npm install
npm run build
```

The build process:
1. Compiles TypeScript to JavaScript
2. Moves the output to `dist/index.mjs` for Lambda deployment

## Testing

```bash
npm test
```

## Example Usage

### Request

```bash
curl -X GET "https://api.example.com/chat/history?sessionId=abc123&limit=20" \
  -H "Authorization: Bearer <token>"
```

### Response

```json
{
  "messages": [
    {
      "userId": "user123",
      "sessionId": "abc123",
      "messageId": "msg-001",
      "timestamp": 1704067200000,
      "role": "assistant",
      "content": "Here's the information you requested...",
      "metadata": {
        "retrievedChunks": ["chunk-1", "chunk-2"],
        "tokenCount": 150,
        "latency": 1200
      }
    },
    {
      "userId": "user123",
      "sessionId": "abc123",
      "messageId": "msg-002",
      "timestamp": 1704067100000,
      "role": "user",
      "content": "Can you tell me about...?"
    }
  ],
  "nextToken": "eyJQSyI6IlVTRVIjdXNlcjEyMyNTRVNTSU9OI2FiYzEyMyIsIlNLIjoxNzA0MDY3MTAwMDAwfQ=="
}
```

## Integration

This Lambda function is designed to be integrated with:

1. **API Gateway**: REST API with Lambda proxy integration
2. **Lambda Authorizer**: For authentication and userId extraction
3. **DynamoDB**: ChatHistory table with composite key (PK=userId#sessionId, SK=timestamp)
4. **KMS**: For message content decryption

## Performance Considerations

- Messages are retrieved in reverse chronological order (most recent first)
- Pagination is implemented using DynamoDB's LastEvaluatedKey
- Decryption is performed in-memory for each message
- The function aims to complete within 500ms as per Requirement 8.3

## Error Handling

- Invalid sessionId: Returns 400 Bad Request
- Missing authentication: Returns 401 Unauthorized
- KMS decryption errors: Returns 500 with specific error message
- Failed message decryption: Skips the message and continues (logged)
- General errors: Returns 500 Internal Server Error

## Security

- All message content is encrypted at rest using KMS
- Authentication is required via API Gateway authorizer
- Users can only access their own conversation history
- CORS is enabled for browser access
