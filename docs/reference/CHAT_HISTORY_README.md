# Chat History Component

## Overview

The Chat History component provides a user interface for viewing and loading previous chat conversations. It integrates with the backend chat history API to retrieve persisted messages.

## Features

- **View Past Messages**: Display all messages from the current session in chronological order
- **Pagination**: Load more messages with "Load More" button when available
- **Load into Chat**: Restore previous conversation into the active chat window
- **Responsive Design**: Adapts to mobile and desktop layouts
- **Real-time Timestamps**: Shows relative time (e.g., "5m ago", "2h ago")
- **Error Handling**: Graceful error display with retry functionality

## Usage

### In ChatView

The chat history panel is toggled via a history icon button in the top-right corner of the chat interface:

```tsx
import ChatHistory from './ChatHistory';

<ChatHistory 
    sessionId={sessionId}
    onClose={() => setShowHistory(false)}
/>
```

### Props

- `sessionId` (string, required): The current chat session ID
- `onClose` (function, optional): Callback when the close button is clicked

## API Integration

The component fetches chat history from the `/chat/history` endpoint:

```
GET /chat/history?sessionId={sessionId}&limit=50&nextToken={token}
```

### Response Format

```json
{
  "messages": [
    {
      "messageId": "msg-123",
      "role": "user",
      "content": "Hello",
      "timestamp": 1234567890000
    }
  ],
  "nextToken": "optional-pagination-token"
}
```

## Styling

The component uses `ChatHistory.css` for styling with the following key classes:

- `.chat-history-panel`: Main container
- `.history-message`: Individual message container
- `.history-message.user`: User message styling
- `.history-message.assistant`: Assistant message styling

## Features in Detail

### Pagination

- Loads 50 messages at a time
- "Load More" button appears when more messages are available
- Automatically appends new messages to the existing list

### Load History into Chat

The "Load History into Chat" button restores all loaded messages into the active chat window, allowing users to continue previous conversations.

### Timestamp Formatting

Messages display relative timestamps:
- "Just now" - less than 1 minute ago
- "5m ago" - minutes ago
- "2h ago" - hours ago
- "3d ago" - days ago
- Full date - older than 7 days

### Error Handling

- Network errors display with a retry button
- Loading states show a spinner
- Empty states inform users when no history exists

## Mobile Responsiveness

On mobile devices (< 768px), the chat history panel:
- Becomes a full-screen overlay
- Removes the border-left styling
- Adjusts padding for better touch interaction

## Integration with Chat Context

The component uses the `useChatContext` hook to update the main chat messages when loading history:

```tsx
const { updateMessages } = useChatContext();

const loadHistoryIntoChat = () => {
    updateMessages(history);
    if (onClose) {
        onClose();
    }
};
```

## Requirements Validated

This component helps validate the following requirements:

- **Requirement 8.3**: Chat history retrieval within 500ms
- **Requirement 8.4**: 90-day retention period (enforced by backend)
- **User Experience**: Seamless access to conversation history

## Future Enhancements

Potential improvements:
- Search within chat history
- Filter by date range
- Export chat history
- Multiple session management
- Delete individual messages
