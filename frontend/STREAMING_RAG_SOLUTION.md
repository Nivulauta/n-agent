# Streaming + RAG Citations - Clean Solution

## Current Issues
1. RAG chunks exist in `currentRAGChunksRef.current` but don't make it to message metadata
2. State updates with metadata aren't triggering re-renders
3. Message component never receives the metadata with retrievedChunks

## Root Cause
The in-place update strategy is not properly triggering React's change detection for the metadata field, even though we're creating new objects.

## Recommended Solution

### Option 1: Store RAG chunks separately (Simplest)
Instead of trying to update message metadata in-place, store RAG chunks in a separate state:

```typescript
const [messageRAGChunks, setMessageRAGChunks] = useState<Record<string, DocumentChunk[]>>({});

// When complete message arrives:
if (currentRAGChunksRef.current) {
    setMessageRAGChunks(prev => ({
        ...prev,
        [messageId]: currentRAGChunksRef.current!
    }));
}

// In ChatWindow, pass both:
<Message 
    message={message} 
    ragChunks={messageRAGChunks[message.messageId]} 
/>
```

### Option 2: Add metadata after streaming completes
Keep streaming simple (just content updates), then add metadata in a separate state update after isStreaming becomes false.

### Option 3: Use a different state structure
Instead of array of messages, use a Map or object keyed by messageId, which makes updates more explicit.

## Why Current Approach Fails
React's change detection works on reference equality. Even though we're creating new objects with `.map()`, React might be optimizing and not detecting the metadata change because:
1. The message object reference changes
2. But the metadata object might have the same structure
3. React's reconciliation might not deep-compare metadata

## Next Steps
I recommend implementing Option 1 (separate RAG chunks state) as it's:
- Simple and explicit
- Doesn't rely on complex state updates
- Easy to debug
- Maintains the no-flicker streaming behavior

Would you like me to implement this solution?
