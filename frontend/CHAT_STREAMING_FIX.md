# Chat Streaming and State Persistence Fix

## Issues Fixed

### 1. TypeScript Error in ChatWindow.tsx
**Problem**: `console.log()` inside JSX returns `void`, which is not assignable to `ReactNode`.

**Solution**: Moved the debug logging outside of the JSX return statement.

### 2. Chat State Persistence on Message Completion
**Problem**: When `isComplete: true` arrives, the streaming message disappears before the complete message appears, causing the chat window to clear.

**Root Cause**: The backend sends the full accumulated content with each streaming update (not incremental tokens). The code was trying to accumulate content, which caused issues with message ID tracking and state updates.

**Solution**: 
- Simplified streaming logic to replace content on each update (since backend sends full content)
- Set `currentMessageIdRef` on the first chunk to track the message
- Keep the deferred clearing of streaming state using `setTimeout(() => {...}, 0)` to ensure the complete message is added to the array before clearing

## How It Works Now

### Streaming Flow
1. **First chunk arrives**: Set `currentMessageIdRef` and display content
2. **Subsequent chunks**: Replace streaming content with new full content from backend
3. **Complete message arrives**: 
   - Create complete message object with final content
   - Add to messages array
   - Defer clearing streaming state to next tick (prevents flicker)

### Key Changes

**Chat.tsx**:
```typescript
// Set message ID on first chunk
if (!currentMessageIdRef.current && messageId) {
    currentMessageIdRef.current = messageId;
}

// Backend sends full accumulated content, so just replace
setStreamingContent(content);
```

**ChatWindow.tsx**:
- Removed `console.log()` from JSX (was causing TypeScript error)
- Moved debug logging to proper location outside render

## Testing

To verify the fix works:

1. Send a message in the chat
2. Watch the streaming response appear
3. Verify the message persists when streaming completes
4. Check that RAG citations appear with the complete message
5. Verify no flicker or disappearing content

## Console Logs to Monitor

Key logs to watch:
- "Setting initial message ID" - First chunk received
- "Updating streaming content (backend sends full content)" - Each streaming update
- "Complete message received" - Final message
- "Adding complete message to array" - Message being saved
- "Clearing streaming state" - Cleanup after message saved
