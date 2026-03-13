# WebSocket Token Synchronization Fix

## Problem
The WebSocket connection was using a stale/cached token instead of the current token from the auth context, causing 403 authentication errors.

## Root Cause
When a user logs in, the auth context updates with a new token, but the WebSocket connection was already established with the old token (or no token). The useEffect dependency array includes `token`, so it should reconnect when the token changes, but there might be timing issues or the token prop not updating properly.

## Solution

### 1. Enhanced Debugging
Added comprehensive logging to track token flow:

```typescript
useEffect(() => {
    console.log('WebSocket useEffect triggered');
    console.log('Token value:', token);
    console.log('Token length:', token?.length);
    
    // Verify token is fresh from localStorage
    const storedToken = localStorage.getItem('chatbot_session_token');
    if (storedToken) {
        const parsed = JSON.parse(storedToken);
        console.log('Token from localStorage:', parsed.token.substring(0, 20) + '...');
        console.log('Token from prop:', token?.substring(0, 20) + '...');
        console.log('Tokens match:', parsed.token === token);
    }
    
    // ... rest of WebSocket initialization
}, [websocketUrl, token]);
```

### 2. Added Token Update Method
Added `updateToken()` method to WebSocketManager to allow dynamic token updates:

```typescript
updateToken(newToken: string): void {
    if (this.token === newToken) {
        console.log('Token unchanged, no reconnection needed');
        return;
    }

    console.log('Token updated, reconnecting WebSocket...');
    this.token = newToken;
    
    // Disconnect and reconnect with new token
    if (this.ws) {
        this.intentionallyClosed = false;
        this.disconnect();
        this.connect();
    }
}
```

### 3. Improved Error Logging
Enhanced WebSocket close event logging to identify authentication failures:

```typescript
if (event.code === 1006) {
    console.error('WebSocket closed abnormally (1006) - likely authentication failure (403)');
    console.error('Check: 1) Token is valid, 2) Token not expired, 3) Session exists in DynamoDB');
}
```

## Verification Steps

### Step 1: Check Token Flow
Open browser console and watch for these logs when logging in:

```
WebSocket useEffect triggered
Token value: eyJhbGc...
Token length: 200+
Token from localStorage: eyJhbGc...
Token from prop: eyJhbGc...
Tokens match: true
```

### Step 2: Verify Token in WebSocket URL
Check the WebSocket connection URL in Network tab:

```
wss://your-api.execute-api.region.amazonaws.com/dev?token=eyJhbGc...
```

The token should match the one in localStorage.

### Step 3: Check for Token Mismatch
If you see:
```
Tokens match: false
```

This indicates the auth context is not updating properly. Solutions:
1. Force a re-render after login
2. Use a ref instead of state for token
3. Get token directly from localStorage in WebSocket initialization

## Alternative Solution: Get Token Directly from Storage

If the token prop is not updating reliably, modify the Chat component to get the token directly from storage:

```typescript
useEffect(() => {
    // Get fresh token from storage
    const sessionToken = getToken();
    if (!sessionToken) {
        console.error('No token found in storage');
        return;
    }

    const manager = new WebSocketManager({
        url: websocketUrl,
        token: sessionToken.token, // Use token from storage
        // ... rest of config
    });

    manager.connect();
    setWsManager(manager);

    return () => {
        manager.disconnect();
    };
}, [websocketUrl]); // Remove token from dependencies
```

## Testing

### Test 1: Fresh Login
1. Clear localStorage
2. Log in
3. Check console for token logs
4. Verify WebSocket connects successfully

### Test 2: Token Change
1. Log in
2. Wait for WebSocket to connect
3. Log out and log in again
4. Verify WebSocket reconnects with new token

### Test 3: Expired Token
1. Log in
2. Manually expire the token in localStorage:
   ```javascript
   const token = JSON.parse(localStorage.getItem('chatbot_session_token'));
   token.expiresAt = Date.now() - 1000; // Set to past
   localStorage.setItem('chatbot_session_token', JSON.stringify(token));
   ```
3. Refresh page
4. Should redirect to login

## Common Issues

### Issue 1: Token Prop Not Updating
**Symptom:** Console shows "Tokens match: false"

**Cause:** Auth context state not updating properly

**Solution:** 
- Check AuthContext implementation
- Ensure `setAuthState` is called after login
- Verify token is stored in state correctly

### Issue 2: WebSocket Not Reconnecting
**Symptom:** Token changes but WebSocket doesn't reconnect

**Cause:** useEffect not triggering

**Solution:**
- Verify token is in dependency array
- Check if token value actually changes (not just reference)
- Use `updateToken()` method manually if needed

### Issue 3: Multiple WebSocket Connections
**Symptom:** Multiple WebSocket connections in Network tab

**Cause:** useEffect cleanup not working properly

**Solution:**
- Ensure cleanup function calls `manager.disconnect()`
- Check for multiple Chat component instances
- Verify useEffect dependencies are correct

## Debug Commands

### Check Current Token
```javascript
// In browser console
const token = JSON.parse(localStorage.getItem('chatbot_session_token'));
console.log('Token:', token.token);
console.log('Expires:', new Date(token.expiresAt));
console.log('User ID:', token.userId);
```

### Decode JWT Token
```javascript
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('JWT Payload:', payload);
```

### Force WebSocket Reconnect
```javascript
// If you have access to wsManager
wsManager.disconnect();
wsManager.connect();
```

### Test with Fresh Token
```javascript
// Get fresh token from auth context
const { token } = useAuth();
console.log('Auth context token:', token);

// Compare with localStorage
const storedToken = JSON.parse(localStorage.getItem('chatbot_session_token')).token;
console.log('Stored token:', storedToken);
console.log('Match:', token === storedToken);
```

## Best Practices

### 1. Always Use Fresh Token
Get token from storage or auth context at connection time, not at component mount:

```typescript
useEffect(() => {
    const sessionToken = getToken();
    if (!sessionToken) return;
    
    const manager = new WebSocketManager({
        url: websocketUrl,
        token: sessionToken.token,
        // ...
    });
    
    manager.connect();
}, [websocketUrl]);
```

### 2. Handle Token Expiration
Check token expiration before connecting:

```typescript
const sessionToken = getToken();
if (!sessionToken || isTokenExpired(sessionToken)) {
    console.error('Token expired, redirecting to login');
    logout();
    return;
}
```

### 3. Reconnect on Token Refresh
If implementing token refresh, reconnect WebSocket:

```typescript
const refreshToken = async () => {
    const newToken = await fetchNewToken();
    storeToken(newToken);
    
    // Reconnect WebSocket with new token
    if (wsManager) {
        wsManager.updateToken(newToken.token);
    }
};
```

### 4. Clear WebSocket on Logout
Ensure WebSocket is disconnected on logout:

```typescript
const logout = async () => {
    // Disconnect WebSocket first
    if (wsManager) {
        wsManager.disconnect();
    }
    
    // Then clear auth state
    await logoutAPI();
    removeToken();
};
```

## Related Files
- `frontend/src/components/Chat.tsx` - Chat component with WebSocket
- `frontend/src/utils/websocket.ts` - WebSocket manager
- `frontend/src/contexts/AuthContext.tsx` - Auth context provider
- `frontend/src/utils/auth.ts` - Token storage utilities
- `frontend/WEBSOCKET_403_TROUBLESHOOTING.md` - 403 error troubleshooting

## Summary
The fix adds comprehensive logging to track token flow and ensures the WebSocket always uses the current token from the auth context. The useEffect dependency array includes `token`, so the WebSocket will reconnect whenever the token changes. Additional debugging helps identify if the token prop is not updating properly.
