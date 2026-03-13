# WebSocket 403 Error Fix

## Problem

After initial login, the WebSocket connection was closing abnormally with a 403 error (manifesting as close code 1006), but retrying the connection would succeed.

## Root Cause

This was a **timing/race condition** between login completion and WebSocket connection:

1. **Login API** creates a session record in DynamoDB
2. **Frontend** immediately receives the token and tries to connect WebSocket
3. **WebSocket Authorizer** queries DynamoDB to validate the session
4. **Race condition**: Even though the authorizer uses `ConsistentRead: true`, there can be delays due to:
   - Network latency between login API response and session write completion
   - Lambda cold start for the authorizer function
   - API Gateway request routing time
5. **First attempt fails** with 403 because session validation fails
6. **Retry succeeds** because by then the session is fully available

## Solution

### 1. Increased Post-Login Delay (AuthContext.tsx)

Increased the delay after successful login from 100ms to 500ms to account for:
- Network latency
- Lambda cold starts
- API Gateway routing time

```typescript
// Delay to ensure DynamoDB session is fully propagated and Lambda authorizer is ready
// This prevents WebSocket 403 errors on first connection attempt
await new Promise(resolve => setTimeout(resolve, 500));
```

### 2. Smart Retry Logic (websocket.ts)

Added special handling for authentication failures (close code 1006) on the first connection attempt:

```typescript
// For authentication failures (1006) on first attempt, use shorter delay
// This handles the race condition after login where session might not be ready yet
if (event.code === 1006 && this.reconnectAttempts === 0) {
    console.log('First connection attempt failed with 1006 - retrying quickly');
    this.scheduleReconnect(500); // 500ms for first retry
} else {
    this.scheduleReconnect(); // Normal exponential backoff
}
```

### 3. Enhanced Logging

Added detailed logging to help diagnose similar issues in the future:
- Logs when 1006 errors occur with context about likely causes
- Notes that this can happen after login and retry should succeed
- Provides troubleshooting hints

## Backend Context

The Lambda authorizer already uses best practices:
- `ConsistentRead: true` on DynamoDB queries (line 168 in `lambda/auth/authorizer/src/index.ts`)
- This ensures we read the latest data, not eventually consistent data

However, consistent reads don't eliminate all timing issues - they only ensure we read the latest committed data. The delay accounts for the time between API response and data commit completion.

## Testing

To verify the fix:
1. Clear browser storage and logout
2. Login with valid credentials
3. Observe WebSocket connection status
4. Connection should succeed on first attempt (or very quickly on retry)
5. No 403 errors should appear in console

## Alternative Solutions Considered

1. **Retry in authorizer**: Could add retry logic in the authorizer itself, but this increases Lambda execution time and costs
2. **Polling in frontend**: Could poll for session availability before connecting, but adds complexity
3. **Longer delay**: Could use 1000ms+ delay, but degrades user experience
4. **Session pre-creation**: Could create session before login completes, but adds complexity to auth flow

The chosen solution balances reliability, performance, and user experience.
