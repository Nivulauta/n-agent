# CORS Credentials Configuration Fix

## Issue
Document upload and other API requests were not passing CORS credentials in the request headers, causing authentication failures even when the backend was configured to accept CORS requests.

## Root Cause
The frontend was making requests without the `credentials: 'include'` option (for fetch) or `withCredentials: true` (for axios), which is required for cross-origin requests that need to include authentication headers.

## Changes Made

### 1. DocumentUpload.tsx
Added `credentials: 'include'` to the fetch request for getting presigned upload URLs:

```typescript
const response = await fetch(
    `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.upload}`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken.token}`,
        },
        credentials: 'include',  // Added
        body: JSON.stringify(uploadRequest),
    }
);
```

### 2. DocumentList.tsx
Added `credentials: 'include'` to both fetch requests:

**List documents:**
```typescript
const response = await fetch(
    `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.list}`,
    {
        headers: {
            'Authorization': `Bearer ${sessionToken.token}`,
        },
        credentials: 'include',  // Added
    }
);
```

**Delete document:**
```typescript
const response = await fetch(
    `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.delete(documentId)}`,
    {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${sessionToken.token}`,
        },
        credentials: 'include',  // Added
    }
);
```

### 3. axios.ts
Added `withCredentials: true` to the axios instance configuration:

```typescript
const axiosInstance = axios.create({
    baseURL: API_CONFIG.apiUrl,
    timeout: 30000,
    withCredentials: true,  // Added
    headers: {
        'Content-Type': 'application/json',
    },
});
```

### 4. AuthContext.tsx
Added `withCredentials: true` to the login request:

```typescript
const response = await axios.post<LoginResponse>(
    `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.auth.login}`,
    credentials,
    {
        withCredentials: true,  // Added
    }
);
```

## Why This Matters

### CORS with Credentials
When making cross-origin requests that include authentication headers (like `Authorization: Bearer <token>`), browsers require:

1. **Client-side**: `credentials: 'include'` (fetch) or `withCredentials: true` (axios)
2. **Server-side**: 
   - `Access-Control-Allow-Credentials: true` header
   - `Access-Control-Allow-Origin` must be a specific origin (not `*`)

Without the client-side configuration, the browser won't send the authentication headers, even if they're specified in the request.

## Testing

To verify the fix:

1. Open browser DevTools → Network tab
2. Upload a document
3. Check the request headers - should include:
   - `Authorization: Bearer <token>`
   - Request should succeed with 200 status
4. Check response headers - should include:
   - `Access-Control-Allow-Origin: http://localhost:5173`
   - `Access-Control-Allow-Credentials: true`

## Related Files

- `frontend/src/components/DocumentUpload.tsx`
- `frontend/src/components/DocumentList.tsx`
- `frontend/src/utils/axios.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `lambda/documents/upload/src/index.ts` (backend CORS headers)
- `lambda/documents/list/src/index.ts` (backend CORS headers)
- `lambda/documents/delete/src/index.ts` (backend CORS headers)
- `lambda/auth/login/src/index.ts` (backend CORS headers)
- `lambda/auth/logout/src/index.ts` (backend CORS headers)

## Notes

- The backend Lambda functions already have the correct CORS headers configured (from previous fix)
- This fix ensures the frontend properly sends credentials with those requests
- All fetch and axios requests now consistently include credentials
