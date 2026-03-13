# Chat Interface Components

This directory contains the chat interface components for the AWS Claude RAG Chatbot.

## Components

### Chat.tsx
Main chat interface that orchestrates the entire chat experience. Integrates WebSocket connection, message handling, and UI components.

**Features:**
- WebSocket connection management with automatic reconnection
- Optimistic UI updates (user messages appear immediately)
- Streaming response handling (tokens displayed as they arrive)
- Typing indicator display
- Connection status indicator
- Error handling

**Usage:**
```tsx
import { Chat } from './components';

<Chat
  token={sessionToken}
  userId={userId}
  sessionId={sessionId}
  websocketUrl={WEBSOCKET_URL}
/>
```

### ChatWindow.tsx
Displays the message history with auto-scrolling and streaming support.

**Features:**
- Auto-scroll to latest message
- Displays message history
- Shows streaming content in real-time
- Displays typing indicator
- Smooth animations

**Props:**
- `messages`: Array of ChatMessage objects
- `isTyping`: Boolean indicating if assistant is typing
- `streamingContent`: Current streaming content (optional)
- `className`: Additional CSS classes (optional)

### Message.tsx
Individual message component with support for document citations.

**Features:**
- User/assistant message styling
- Timestamp display
- Document citations with expandable sources
- Citation details (document name, page number, excerpt)
- Cached response indicator

**Props:**
- `message`: ChatMessage object

### MessageInput.tsx
Text input field with send button for composing messages.

**Features:**
- Auto-resizing textarea
- Send on Enter (Shift+Enter for new line)
- Disabled state when not connected
- Send button with icon
- Keyboard shortcuts

**Props:**
- `onSendMessage`: Callback function when message is sent
- `disabled`: Boolean to disable input (optional)
- `placeholder`: Placeholder text (optional)

### TypingIndicator.tsx
Animated typing indicator shown while waiting for assistant response.

**Features:**
- Animated dots
- Consistent styling with message components

## Implementation Details

### Optimistic UI Updates (Requirement 2.1)
User messages are displayed immediately upon submission without waiting for server confirmation:

```tsx
// In Chat.tsx handleSendMessage
const userMessage: ChatMessage = {
    messageId: `temp-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now()
};

// Add to messages immediately
setMessages(prev => [...prev, userMessage]);

// Then send to server
wsManager.send({ action: 'chat_message', data: { message: content, sessionId } });
```

### Streaming Response (Requirement 2.2)
Assistant responses are streamed token-by-token as they arrive:

```tsx
// In Chat.tsx handleChatResponse
if (isComplete) {
    // Complete message - add to messages array
    setMessages(prev => [...prev, completeMessage]);
    setStreamingContent('');
} else {
    // Streaming token - update streaming content
    setStreamingContent(content);
}
```

The `ChatWindow` component displays streaming content separately from completed messages:

```tsx
{streamingContent && (
    <div className="message assistant streaming">
        <div className="message-content">
            {streamingContent}
        </div>
    </div>
)}
```

### Typing Indicator (Requirement 2.5)
Typing indicator is displayed while waiting for the first response token:

```tsx
// Show typing indicator when message is sent
setIsTyping(true);

// Hide when first token arrives
if (!isComplete) {
    setIsTyping(false);
}

// Display in ChatWindow
{isTyping && !streamingContent && <TypingIndicator />}
```

### Document Citations (Requirement 7.4)
RAG responses include expandable document citations:

```tsx
// Citations included in message metadata
interface ChatMessage {
    metadata?: {
        retrievedChunks?: DocumentChunk[];
    };
}

// Displayed in Message component
{hasCitations && (
    <button onClick={() => setShowCitations(!showCitations)}>
        View Sources ({chunks.length})
    </button>
)}
```

## Styling

Each component has its own CSS file:
- `Chat.css` - Main chat container and connection status
- `ChatWindow.css` - Message container and scrolling
- `Message.css` - Message bubbles and citations
- `MessageInput.css` - Input field and send button
- `TypingIndicator.css` - Animated typing dots

## WebSocket Integration

The components integrate with `WebSocketManager` from `utils/websocket.ts`:

```tsx
const manager = new WebSocketManager({
    url: websocketUrl,
    token,
    onMessage: handleWebSocketMessage,
    onStateChange: setConnectionState
});

manager.connect();
```

### Message Types
- `chat_response`: Assistant response (streaming or complete)
- `typing_indicator`: Typing status update
- `error`: Error message from server
- `system`: System notifications

## Testing

To test the components:

1. **Optimistic UI**: Send a message and verify it appears immediately
2. **Streaming**: Send a query and verify tokens appear incrementally
3. **Typing Indicator**: Verify indicator shows before first token
4. **Citations**: Send a RAG query and verify sources are expandable
5. **Reconnection**: Disconnect network and verify reconnection attempt

## Requirements Validation

- ✅ **Requirement 2.1**: User messages display immediately (optimistic UI)
- ✅ **Requirement 2.2**: Responses stream token-by-token via WebSocket
- ✅ **Requirement 2.5**: Typing indicator displays while processing
- ✅ **Requirement 7.4**: Document citations displayed for RAG responses
