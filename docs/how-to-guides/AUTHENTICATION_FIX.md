# Authentication Fix for Document Operations

## Problem
Document upload and list operations were failing with "Not authenticated" error, even when the user was logged in.

## Root Cause
The components were trying to retrieve the token directly from localStorage using:
```typescript
const token = localStorage.getItem('token');
```

However, the authentication system stores the token under a different key (`'chatbot_session_token'`) as a JSON object:
```typescript
{
  token: "actual-jwt-token",
  expiresAt: 1234567890,
  userId: "user-id"
}
```

## Solution
Updated all components to use the `getToken()` utility function from `utils/auth.ts`, which:
1. Retrieves the token from the correct localStorage key
2. Parses the JSON object
3. Checks if the token is expired
4. Returns null if expired or missing

## Files Modified

### 1. DocumentUpload.tsx
**Before:**
```typescript
const token = localStorage.getItem('token');
if (!token) {
    throw new Error('Not authenticated');
}

headers: {
    'Authorization': `Bearer ${token}`,
}
```

**After:**
```typescript
import { getToken } from '../utils/auth';

const sessionToken = getToken();
if (!sessionToken) {
    throw new Error('Not authenticated');
}

headers: {
    'Authorization': `Bearer ${sessionToken.token}`,
}
```

### 2. DocumentList.tsx
Fixed in two places:
- `fetchDocuments()` function
- `handleConfirmDelete()` function

Same pattern as DocumentUpload.tsx.

## Token Storage Architecture

### Storage Keys
- **Token**: `'chatbot_session_token'`
- **User Context**: `'chatbot_user_context'`

### Token Structure
```typescript
interface SessionToken {
    token: string;      // The actual JWT token
    expiresAt: number;  // Unix timestamp
    userId: string;     // User ID
}
```

### User Context Structure
```typescript
interface UserContext {
    userId: string;
    username: string;
    roles: string[];
    sessionId: string;
}
```

## Auth Utility Functions

### Available Functions
```typescript
// Store token
storeToken(token: SessionToken): void

// Retrieve token (with expiration check)
getToken(): SessionToken | null

// Remove token
removeToken(): void

// Check if token is expired
isTokenExpired(token: SessionToken): boolean

// Store user context
storeUserContext(user: UserContext): void

// Get user context
getUserContext(): UserContext | null

// Get authorization header
getAuthHeader(): { Authorization: string } | {}
```

## Best Practices

### ✅ DO
```typescript
import { getToken } from '../utils/auth';

const sessionToken = getToken();
if (!sessionToken) {
    throw new Error('Not authenticated');
}

fetch(url, {
    headers: {
        'Authorization': `Bearer ${sessionToken.token}`,
    }
});
```

### ❌ DON'T
```typescript
// Don't access localStorage directly
const token = localStorage.getItem('token');

// Don't use hardcoded keys
const token = localStorage.getItem('chatbot_session_token');
```

## Alternative: Use Axios Instance

For API calls, consider using the configured axios instance which automatically handles authentication:

```typescript
import axiosInstance from '../utils/axios';

// Axios automatically adds Authorization header
const response = await axiosInstance.post('/documents/upload', data);
```

The axios instance is configured with an interceptor that:
1. Automatically adds the Authorization header
2. Handles 401 responses (token expired)
3. Redirects to login if needed

## Testing

### Test Token Storage
```javascript
// In browser console after login
const token = localStorage.getItem('chatbot_session_token');
console.log('Token:', JSON.parse(token));

// Should show:
// {
//   token: "eyJhbGc...",
//   expiresAt: 1234567890,
//   userId: "user-id"
// }
```

### Test Token Retrieval
```javascript
import { getToken } from './utils/auth';

const sessionToken = getToken();
console.log('Session Token:', sessionToken);
console.log('JWT:', sessionToken?.token);
```

### Test Document Upload
1. Log in to the application
2. Navigate to document upload
3. Select a PDF file
4. Click upload
5. Should succeed without "Not authenticated" error

## Related Files
- `frontend/src/utils/auth.ts` - Auth utility functions
- `frontend/src/contexts/AuthContext.tsx` - Auth context provider
- `frontend/src/utils/axios.ts` - Axios instance with auth interceptor
- `frontend/src/components/DocumentUpload.tsx` - Document upload component
- `frontend/src/components/DocumentList.tsx` - Document list component

## Migration Guide

If you have other components that access localStorage directly for authentication:

1. Import the auth utility:
   ```typescript
   import { getToken } from '../utils/auth';
   ```

2. Replace direct localStorage access:
   ```typescript
   // Before
   const token = localStorage.getItem('token');
   
   // After
   const sessionToken = getToken();
   ```

3. Update header usage:
   ```typescript
   // Before
   'Authorization': `Bearer ${token}`
   
   // After
   'Authorization': `Bearer ${sessionToken.token}`
   ```

4. Add null check:
   ```typescript
   if (!sessionToken) {
       throw new Error('Not authenticated');
   }
   ```

## Future Improvements

1. **Centralized API Client**: Create a wrapper around fetch that automatically handles authentication
2. **Token Refresh**: Implement automatic token refresh before expiration
3. **Secure Storage**: Consider using more secure storage mechanisms for sensitive tokens
4. **Error Handling**: Standardize authentication error handling across components
