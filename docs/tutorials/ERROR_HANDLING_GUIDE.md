# Error Handling and User Feedback Implementation

This document describes the comprehensive error handling and user feedback system implemented in the AWS Claude RAG Chatbot frontend.

## Overview

The error handling system provides:
- Consistent error display across all components
- Rate limit handling with countdown timers
- WebSocket connection status monitoring
- Automatic reconnection with exponential backoff
- User-friendly error messages
- Retry capabilities for recoverable errors

## Components

### 1. ErrorMessage Component

**Location**: `src/components/ErrorMessage.tsx`

**Purpose**: Displays general error messages with optional retry functionality.

**Props**:
- `title?: string` - Optional error title
- `message: string` - Error message to display
- `severity?: 'error' | 'warning' | 'info'` - Visual severity level
- `retryable?: boolean` - Whether the error can be retried
- `onRetry?: () => void` - Callback for retry action
- `onDismiss?: () => void` - Callback for dismissing the error

**Usage**:
```tsx
<ErrorMessage
    title="Upload Failed"
    message="Unable to upload document. Please try again."
    severity="error"
    retryable={true}
    onRetry={handleRetry}
    onDismiss={() => setError(null)}
/>
```

### 2. RateLimitError Component

**Location**: `src/components/RateLimitError.tsx`

**Purpose**: Displays rate limit errors with a countdown timer showing when retry is available.

**Props**:
- `retryAfterSeconds: number` - Number of seconds until retry is allowed
- `onRetryAvailable?: () => void` - Callback when retry becomes available
- `onDismiss?: () => void` - Callback for dismissing the error

**Features**:
- Automatic countdown timer
- Progress bar showing time remaining
- Auto-dismisses when countdown reaches zero

**Usage**:
```tsx
<RateLimitError
    retryAfterSeconds={60}
    onRetryAvailable={() => setRateLimitError(null)}
    onDismiss={() => setRateLimitError(null)}
/>
```

### 3. ConnectionStatus Component

**Location**: `src/components/ConnectionStatus.tsx`

**Purpose**: Displays WebSocket connection status with reconnection information.

**Props**:
- `state: WebSocketConnectionState` - Current connection state
- `reconnectAttempt?: number` - Current reconnection attempt number
- `maxReconnectAttempts?: number` - Maximum reconnection attempts
- `reconnectDelay?: number` - Delay until next reconnection attempt (ms)

**States**:
- `connecting` - Initial connection in progress
- `connected` - Successfully connected (component hidden)
- `disconnected` - Connection lost, attempting to reconnect
- `error` - Connection error occurred

**Usage**:
```tsx
<ConnectionStatus
    state={connectionState}
    reconnectAttempt={reconnectInfo?.attempt}
    maxReconnectAttempts={reconnectInfo?.maxAttempts}
    reconnectDelay={reconnectInfo?.delay}
/>
```

## Utilities

### 1. Error Handler Utility

**Location**: `src/utils/errorHandler.ts`

**Purpose**: Centralized error parsing and handling logic.

**Functions**:

#### `parseError(error: any): AppError`
Converts various error types into a standardized AppError format.

```typescript
interface AppError {
    code: string;
    message: string;
    retryable: boolean;
    retryAfter?: number;
}
```

#### `getErrorMessage(code: string, defaultMessage?: string): string`
Returns user-friendly error messages based on error codes.

#### `isRetryableError(error: any): boolean`
Determines if an error can be retried.

#### `getRetryDelay(attemptNumber: number, baseDelay?: number): number`
Calculates exponential backoff delay for retry attempts.

**Usage**:
```typescript
import { parseError } from '../utils/errorHandler';

try {
    await someApiCall();
} catch (error) {
    const appError = parseError(error);
    setError({
        message: appError.message,
        retryable: appError.retryable
    });
}
```

### 2. Axios Error Interceptor

**Location**: `src/utils/axios.ts`

**Purpose**: Automatically handles common HTTP errors and provides consistent error responses.

**Handled Error Types**:
- `401 Unauthorized` - Session expired, triggers re-login
- `429 Too Many Requests` - Rate limit exceeded with retry-after
- `5xx Server Errors` - Server errors with retry capability
- `Network Errors` - Connection issues with retry capability
- `4xx Client Errors` - Validation and other client errors

**Error Response Format**:
```typescript
{
    code: string;
    message: string;
    retryable: boolean;
    retryAfter?: number; // For rate limit errors
}
```

### 3. WebSocket Manager

**Location**: `src/utils/websocket.ts`

**Purpose**: Manages WebSocket connections with automatic reconnection.

**Features**:
- Automatic reconnection with exponential backoff
- Configurable max reconnection attempts (default: 10)
- Keep-alive ping every 5 minutes
- Connection state tracking
- Reconnection attempt callbacks

**Reconnection Delays**: `[1000, 2000, 4000, 8000, 16000]` ms

## Integration Examples

### Chat Component

The Chat component demonstrates full error handling integration:

```typescript
const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
const [rateLimitError, setRateLimitError] = useState<number | null>(null);
const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number; delay: number } | null>(null);

// WebSocket initialization with callbacks
const manager = new WebSocketManager({
    url: websocketUrl,
    token,
    onMessage: handleWebSocketMessage,
    onStateChange: setConnectionState,
    onReconnectAttempt: (attempt, maxAttempts, delay) => {
        setReconnectInfo({ attempt, maxAttempts, delay });
    }
});

// Error handling
const handleError = (message: ErrorMessageType) => {
    const appError = parseError(message.data);
    
    if (appError.code === 'RATE_LIMIT_EXCEEDED' && appError.retryAfter) {
        setRateLimitError(appError.retryAfter);
        setError(null);
    } else {
        setError({ message: appError.message, retryable: appError.retryable });
        setRateLimitError(null);
    }
};

// Render error components
return (
    <div className="chat-container">
        {connectionState !== 'connected' && (
            <ConnectionStatus
                state={connectionState}
                reconnectAttempt={reconnectInfo?.attempt}
                maxReconnectAttempts={reconnectInfo?.maxAttempts}
                reconnectDelay={reconnectInfo?.delay}
            />
        )}
        
        {rateLimitError && (
            <RateLimitError
                retryAfterSeconds={rateLimitError}
                onRetryAvailable={() => setRateLimitError(null)}
                onDismiss={() => setRateLimitError(null)}
            />
        )}
        
        {error && (
            <ErrorMessage
                title="Error"
                message={error.message}
                severity="error"
                retryable={error.retryable}
                onRetry={() => {
                    setError(null);
                    if (connectionState !== 'connected' && wsManager) {
                        wsManager.connect();
                    }
                }}
                onDismiss={() => setError(null)}
            />
        )}
        
        {/* Chat UI components */}
    </div>
);
```

### Document Upload Component

```typescript
import ErrorMessage from './ErrorMessage';

const [error, setError] = useState<string | null>(null);

// In render
{error && (
    <ErrorMessage
        message={error}
        severity="error"
        retryable={!error.includes('Only PDF') && !error.includes('File size')}
        onRetry={handleUpload}
        onDismiss={() => setError(null)}
    />
)}
```

### Document List Component

```typescript
import ErrorMessage from './ErrorMessage';

const [error, setError] = useState<string | null>(null);

// In render
if (error) {
    return (
        <div className="document-list">
            <div className="list-header">
                <h3>My Documents</h3>
            </div>
            <ErrorMessage
                title="Failed to Load Documents"
                message={error}
                severity="error"
                retryable={true}
                onRetry={fetchDocuments}
                onDismiss={() => setError(null)}
            />
        </div>
    );
}
```

## Error Codes

### Standard Error Codes

| Code | Description | Retryable | User Action |
|------|-------------|-----------|-------------|
| `UNAUTHORIZED` | Session expired | No | Re-login required |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Yes | Wait for countdown |
| `SERVER_ERROR` | Server-side error | Yes | Retry after delay |
| `NETWORK_ERROR` | Connection issue | Yes | Check connection and retry |
| `WEBSOCKET_ERROR` | WebSocket error | Yes | Automatic reconnection |
| `VALIDATION_ERROR` | Invalid input | No | Fix input and retry |
| `NOT_FOUND` | Resource not found | No | Check resource exists |
| `FORBIDDEN` | Permission denied | No | Contact administrator |
| `TIMEOUT` | Request timeout | Yes | Retry request |
| `UNKNOWN_ERROR` | Unexpected error | Yes | Retry or contact support |

## Best Practices

### 1. Always Parse Errors
Use the `parseError` utility to standardize error handling:
```typescript
import { parseError } from '../utils/errorHandler';

try {
    await apiCall();
} catch (error) {
    const appError = parseError(error);
    // Use appError.code, appError.message, appError.retryable
}
```

### 2. Provide Retry for Recoverable Errors
Enable retry functionality for transient errors:
```typescript
<ErrorMessage
    message={error.message}
    retryable={error.retryable}
    onRetry={handleRetry}
/>
```

### 3. Show Connection Status
Always display connection status for real-time features:
```typescript
{connectionState !== 'connected' && (
    <ConnectionStatus state={connectionState} />
)}
```

### 4. Handle Rate Limits Gracefully
Use the RateLimitError component for rate limit errors:
```typescript
if (appError.code === 'RATE_LIMIT_EXCEEDED') {
    setRateLimitError(appError.retryAfter || 60);
}
```

### 5. Disable Actions During Errors
Disable user actions when appropriate:
```typescript
<MessageInput
    disabled={connectionState !== 'connected' || rateLimitError !== null}
    placeholder={
        rateLimitError
            ? 'Rate limit exceeded. Please wait...'
            : 'Type your message...'
    }
/>
```

## Testing Error Handling

### Manual Testing Scenarios

1. **Network Disconnection**
   - Disconnect network while using the app
   - Verify ConnectionStatus shows "Disconnected"
   - Verify automatic reconnection attempts
   - Reconnect network and verify connection restored

2. **Rate Limiting**
   - Send multiple rapid requests
   - Verify RateLimitError displays with countdown
   - Verify input is disabled during rate limit
   - Verify countdown completes and input re-enables

3. **Server Errors**
   - Simulate 500 error from backend
   - Verify ErrorMessage displays with retry option
   - Verify retry button works

4. **Session Expiration**
   - Wait for session to expire (24 hours)
   - Make a request
   - Verify redirect to login page

5. **WebSocket Reconnection**
   - Close WebSocket connection from server
   - Verify automatic reconnection with exponential backoff
   - Verify reconnection attempt counter displays

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 10.2**: Rate limit errors display with retry countdown
- **Requirement 14.1**: User-friendly error messages for all failures
- **Requirement 2.4**: WebSocket reconnection within 3 seconds
- **Requirement 2.3**: Persistent WebSocket connections with status display

## Future Enhancements

1. **Error Analytics**: Track error frequency and types
2. **Offline Mode**: Queue actions when offline
3. **Error Recovery**: Automatic retry with exponential backoff
4. **User Notifications**: Toast notifications for non-blocking errors
5. **Error Reporting**: Allow users to report errors to support
