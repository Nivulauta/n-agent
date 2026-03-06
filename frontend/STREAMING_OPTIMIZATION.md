# Streaming Message Optimization

## Problem

The chat interface was experiencing a visible flicker/rerender when streaming messages completed:
1. Streaming content was displayed in a separate component
2. When complete, the streaming content was cleared
3. A new complete message was added to the messages array
4. This caused the message to disappear and reappear, creating a flicker effect

## Solution

Refactored the streaming architecture to update messages in-place instead of replacing them:

### Key Changes

1. **Removed separate streaming content state**
   - Eliminated `streamingContent` and `streamingContentRef` state variables
   - Removed separate streaming display in ChatWindow

2. **Added message to array immediately on first chunk**
   - When the first streaming chunk arrives, add the message to the messages array with `isStreaming: true`
   - Store the message index in `streamingMessageIndexRef`

3. **Update message in-place during streaming**
   - Each subsequent chunk updates the existing message in the array
   - No new messages are added, just content updates

4. **Finalize message when complete**
   - When `isComplete` is received, update the message to set `isStreaming: false`
   - No removal/re-addition of messages

### Benefits

- **Zero flicker**: Message stays in the same DOM position throughout streaming
- **Better performance**: Fewer state updates and re-renders
- **Simpler code**: No need to manage separate streaming state
- **Consistent UX**: Message appears once and updates in place

### Implementation Details

```typescript
// First chunk - add message immediately
if (!currentMessageIdRef.current && messageId && content) {
    const newMessage: ChatMessage = {
        messageId,
        role: 'assistant',
        content: content,
        timestamp: Date.now(),
        isStreaming: true,  // Mark as streaming
        metadata: ...
    };
    setMessages(prev => {
        streamingMessageIndexRef.current = prev.length;
        return [...prev, newMessage];
    });
}

// Subsequent chunks - update in place
if (!isComplete && content && streamingMessageIndexRef.current !== null) {
    setMessages(prev => {
        const updated = [...prev];
        updated[streamingMessageIndexRef.current!] = {
            ...updated[streamingMessageIndexRef.current!],
            content: content,  // Update content
        };
        return updated;
    });
}

// Complete - finalize message
if (isComplete) {
    setMessages(prev => {
        const updated = [...prev];
        updated[streamingMessageIndexRef.current!] = {
            ...updated[streamingMessageIndexRef.current!],
            isStreaming: false,  // Mark as complete
            content: finalContent
        };
        return updated;
    });
}
```

### Type Changes

Added `isStreaming?: boolean` to the `ChatMessage` interface to track streaming state.

### Component Changes

- **Chat.tsx**: Refactored `handleChatResponse` to use in-place updates
- **ChatWindow.tsx**: Removed streaming content props and display logic
- **types/api.ts**: Added `isStreaming` field to `ChatMessage`

## Testing

To verify the fix:
1. Send a message that triggers a streaming response
2. Observe that the message appears once and updates smoothly
3. No flicker or re-render should occur when streaming completes
4. Message should remain in the same visual position throughout
