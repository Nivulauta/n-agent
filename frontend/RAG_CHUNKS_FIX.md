# RAG Chunks Display Fix

## Problem
When `ragChunksCount` is undefined or when RAG chunks arrive without content, the chat window response was being cleared prematurely, causing the streaming message to disappear.

## Root Causes

### 1. RAG Chunks Cleared Too Early
The `currentRAGChunksRef.current` was being set to `undefined` when the complete message arrived, but this happened in the same render cycle as clearing the streaming content, potentially causing a race condition.

### 2. Streaming Content Not Preserved
When `isComplete: true` arrived, the code used `content || ''` which ignored any accumulated streaming content if the final message didn't include content.

### 3. No Handling for RAG-Only Messages
When a streaming message arrived with RAG chunks but no content, the code didn't handle this case properly, leaving the UI in an inconsistent state.

## Solutions

### Fix 1: Use Streaming Content as Fallback
```typescript
const completeMessage: ChatMessage = {
    messageId: messageId || `msg-${Date.now()}`,
    role: 'assistant',
    content: content || streamingContent || '', // Use streaming content if no content in final message
    timestamp: Date.now(),
    metadata: currentRAGChunksRef.current ? { retrievedChunks: currentRAGChunksRef.current } : undefined
};
```

This ensures that if the final `isComplete: true` message doesn't include content, we use the accumulated streaming content instead.

### Fix 2: Clear RAG Chunks After Message Added
The order of operations is now:
1. Create complete message with RAG chunks
2. Add message to array
3. Clear streaming content
4. Clear RAG chunks ref

This ensures RAG chunks are available when creating the message.

### Fix 3: Handle RAG-Only Streaming Messages
```typescript
} else if (retrievedChunks && retrievedChunks.length > 0) {
    // Message has RAG chunks but no content - keep showing streaming state
    console.log('Streaming message with RAG chunks but no content yet');
    setIsTyping(false);
}
```

This handles the case where RAG chunks arrive in a streaming message without content.

### Fix 4: Enhanced Logging
Added logging to track RAG chunks through the complete flow:
```typescript
console.log('Final RAG chunks:', currentRAGChunksRef.current);
```

## Message Flow Scenarios

### Scenario 1: RAG Chunks First, Then Content
1. Message arrives: `{ retrievedChunks: [...], isComplete: false }`
   - RAG chunks stored in ref
   - Typing indicator shown
   - No streaming content yet

2. Message arrives: `{ content: "Hello", isComplete: false }`
   - Content added to streaming
   - RAG chunks still in ref
   - Both displayed in UI

3. Message arrives: `{ isComplete: true }`
   - Complete message created with streaming content + RAG chunks
   - Added to messages array
   - Streaming cleared
   - RAG chunks ref cleared

### Scenario 2: Content and RAG Chunks Together
1. Message arrives: `{ content: "Hello", retrievedChunks: [...], isComplete: false }`
   - Content added to streaming
   - RAG chunks stored in ref
   - Both displayed in UI

2. Message arrives: `{ content: " world", isComplete: false }`
   - Content accumulated
   - RAG chunks still in ref
   - Both displayed in UI

3. Message arrives: `{ isComplete: true }`
   - Complete message created with accumulated content + RAG chunks
   - Added to messages array
   - Streaming cleared
   - RAG chunks ref cleared

### Scenario 3: Complete Message with Everything
1. Message arrives: `{ content: "Hello world", retrievedChunks: [...], isComplete: true }`
   - RAG chunks stored in ref
   - Complete message created immediately
   - Added to messages array
   - No streaming phase

## Testing

### Test 1: RAG Chunks Without Content
Send a message that triggers RAG retrieval:
1. Backend sends RAG chunks first
2. Then sends streaming content
3. Verify RAG chunks appear with streaming content
4. Verify final message includes both

### Test 2: Content Without RAG Chunks
Send a message that doesn't trigger RAG:
1. Backend sends streaming content only
2. Verify content appears
3. Verify final message has no citations

### Test 3: Complete Message
Send a message with immediate complete response:
1. Backend sends complete message with content and RAG chunks
2. Verify message appears immediately
3. Verify citations are shown

### Test 4: Multiple Messages
Send multiple messages in sequence:
1. First message with RAG chunks
2. Second message without RAG chunks
3. Verify RAG chunks from first message don't leak to second

## Debug Commands

### Check RAG Chunks in Console
```javascript
// The Chat component logs this automatically
// Look for:
"Chat response payload: { hasRetrievedChunks: true, chunksCount: 3 }"
"Storing RAG chunks: 3"
"Final RAG chunks: [...]"
```

### Check Streaming State
```javascript
// Look for:
"Streaming update - content length: 50"
"Accumulating content for same message"
"Complete message received, adding to messages array"
```

### Verify Message Structure
```javascript
// In browser console after message completes
// Check the last message in the messages array
const lastMessage = messages[messages.length - 1];
console.log('Content:', lastMessage.content);
console.log('Has metadata:', !!lastMessage.metadata);
console.log('Has RAG chunks:', !!lastMessage.metadata?.retrievedChunks);
console.log('RAG chunks count:', lastMessage.metadata?.retrievedChunks?.length);
```

## Common Issues

### Issue 1: RAG Chunks Disappear
**Symptom:** RAG chunks show during streaming but disappear in final message

**Cause:** `currentRAGChunksRef.current` cleared before message created

**Solution:** Fixed by clearing ref after message is added to array

### Issue 2: Streaming Content Lost
**Symptom:** Streaming content disappears when final message arrives

**Cause:** Final message uses `content || ''` instead of accumulated streaming content

**Solution:** Fixed by using `content || streamingContent || ''`

### Issue 3: Empty Streaming Message
**Symptom:** Blank streaming message appears

**Cause:** RAG chunks arrive without content

**Solution:** Fixed by handling RAG-only messages properly

## Related Files
- `frontend/src/components/Chat.tsx` - Chat component with RAG handling
- `frontend/src/components/ChatWindow.tsx` - Displays streaming content and RAG chunks
- `frontend/src/components/Message.tsx` - Displays completed messages with citations
- `frontend/STREAMING_RAG_DISPLAY.md` - RAG display documentation

## Summary
The fix ensures RAG chunks persist through the entire message lifecycle and are properly included in the final message, even when they arrive separately from the content or when the final message doesn't include content.
