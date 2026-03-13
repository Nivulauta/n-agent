# Message Handling Update

## Issue

The WebSocket payload contains `retrievedChunks` but not `content`, causing the frontend to fail when trying to destructure the message payload.

## Root Cause

The backend is sending RAG context (retrieved document chunks) separately from the actual chat response content. The frontend was expecting both to always be present together. Additionally, the backend uses `payload` instead of `data` for the message body.

## Solution

Updated the frontend to handle multiple message scenarios:

### 1. Updated Type Definitions

**File**: `frontend/src/types/api.ts`

Changed from `data` to `payload` and made all fields optional to handle various backend message formats:

```typescript
export interface ChatResponseMessage extends WebSocketMessage {
    type: 'chat_response';
    payload: {                   // Changed from 'data' to 'payload'
        messageId?: string;      // Optional
        content?: string;        // Optional - may be missing when only sending retrievedChunks
        isComplete?: boolean;    // Optional
        retrievedChunks?: DocumentChunk[];  // Optional
    };
}
```

Added new message type for RAG context:

```typescript
export interface RAGContextMessage extends WebSocketMessage {
    type: 'rag_context';
    payload: {                   // Changed from 'data' to 'payload'
        messageId?: string;
        retrievedChunks: DocumentChunk[];
    };
}
```

### 2. Enhanced Message Handler

**File**: `frontend/src/components/Chat.tsx`

Added comprehensive logging and handling for different message scenarios:

```typescript
// Log the received payload for debugging
console.log('Chat response payload:', {
    messageId,
    hasContent: !!content,
    contentLength: content?.length || 0,
    isComplete,
    hasRetrievedChunks: !!retrievedChunks,
    chunksCount: retrievedChunks?.length || 0
});

// If we have retrieved chunks but no content, show typing indicator
if (retrievedChunks && retrievedChunks.length > 0 && !content) {
    console.log('Received RAG context with retrieved chunks:', retrievedChunks);
    setIsTyping(true);
    return;
}
```

### 3. Added RAG Context Handler

New handler specifically for RAG context messages:

```typescript
const handleRAGContext = (message: RAGContextMessage) => {
    if (!message.payload) {
        console.error('RAG context missing payload:', message);
        return;
    }

    const { retrievedChunks } = message.payload;
    console.log('Received RAG context:', retrievedChunks);
    
    // Show typing indicator while waiting for actual response
    setIsTyping(true);
};
```

### 4. Updated Message Router

Added support for the new `rag_context` message type:

```typescript
switch (message.type) {
    case 'chat_response':
        handleChatResponse(message as ChatResponseMessage);
        break;
    case 'rag_context':
        handleRAGContext(message as RAGContextMessage);
        break;
    case 'typing_indicator':
        handleTypingIndicator(message as TypingIndicatorMessage);
        break;
    case 'error':
        handleError(message as ErrorMessageType);
        break;
    default:
        console.log('Unknown message type:', message);
}
```

## Message Flow Scenarios

### Scenario 1: Direct Response (No RAG)
```json
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Hello! How can I help you?",
    "isComplete": true
  }
}
```
**Handling**: Display content immediately

### Scenario 2: Streaming Response
```json
// First chunk
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Hello",
    "isComplete": false
  }
}

// Second chunk
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Hello! How",
    "isComplete": false
  }
}

// Final chunk
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Hello! How can I help you?",
    "isComplete": true
  }
}
```
**Handling**: Update streaming content, show complete message when done

### Scenario 3: RAG Response with Context First
```json
// First: RAG context
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "retrievedChunks": [
      {
        "documentName": "guide.pdf",
        "pageNumber": 5,
        "text": "Relevant context..."
      }
    ]
  }
}

// Then: Actual response
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Based on the document...",
    "isComplete": true,
    "retrievedChunks": [...]
  }
}
```
**Handling**: Show typing indicator on first message, display response with chunks on second

### Scenario 4: RAG Response with Separate Context Message
```json
// First: RAG context
{
  "type": "rag_context",
  "payload": {
    "messageId": "msg-123",
    "retrievedChunks": [...]
  }
}

// Then: Response
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Based on the document...",
    "isComplete": true
  }
}
```
**Handling**: Show typing indicator on context, display response when received

## Benefits

1. **Robust Error Handling**: Won't crash if fields are missing
2. **Better Logging**: Detailed logs for debugging backend issues
3. **Flexible Message Format**: Supports multiple backend message structures
4. **User Feedback**: Shows typing indicator when RAG context is being processed
5. **Future-Proof**: Easy to add new message types

## Testing

To test the updated message handling:

1. **Send a message without RAG**:
   - Should display response normally
   - No typing indicator issues

2. **Send a message that triggers RAG**:
   - Should show typing indicator when chunks received
   - Should display response with document citations

3. **Check browser console**:
   - Should see detailed logs of message structure
   - Should see what fields are present/missing

## Console Output Example

```
Received WebSocket message: {type: 'chat_response', payload: {...}}
Chat response payload: {
  messageId: 'msg-123',
  hasContent: false,
  contentLength: 0,
  isComplete: false,
  hasRetrievedChunks: true,
  chunksCount: 3
}
Received RAG context with retrieved chunks: [...]
```

## Backend Recommendations

For optimal frontend handling, the backend should send messages in one of these formats:

**Option 1: Combined Message**
```json
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Response text",
    "isComplete": true,
    "retrievedChunks": [...]  // Include if RAG was used
  }
}
```

**Option 2: Separate Messages**
```json
// First message
{
  "type": "rag_context",
  "payload": {
    "messageId": "msg-123",
    "retrievedChunks": [...]
  }
}

// Second message
{
  "type": "chat_response",
  "payload": {
    "messageId": "msg-123",
    "content": "Response text",
    "isComplete": true
  }
}
```

## Files Modified

1. `frontend/src/types/api.ts` - Updated type definitions
2. `frontend/src/components/Chat.tsx` - Enhanced message handling
3. `frontend/MESSAGE_HANDLING_UPDATE.md` - This documentation
