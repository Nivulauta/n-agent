# CORS Fix for Document Endpoints

## Problem
The `/documents/*` endpoints were returning 403 CORS errors when called from the frontend. While the API Gateway had OPTIONS (preflight) CORS configuration, the Lambda function responses were missing required CORS headers.

## Root Cause
Same issue as the auth endpoints - Lambda functions were only returning:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Credentials: true`

But browsers also need these headers in the actual response:
- `Access-Control-Allow-Headers`
- `Access-Control-Allow-Methods`

## Solution
Updated the `createResponse` function in all document Lambda functions to include all required CORS headers.

### Files Modified
1. `lambda/documents/list/src/index.ts` - GET /documents
2. `lambda/documents/upload/src/index.ts` - POST /documents/upload
3. `lambda/documents/delete/src/index.ts` - DELETE /documents/{documentId}

### Changes Made
```typescript
// Before
headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
}

// After
headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
}
```

## Deployment Steps

### 1. Rebuild Lambda Functions
```bash
# List function
cd lambda/documents/list
npm run build

# Upload function
cd ../upload
npm run build

# Delete function
cd ../delete
npm run build
```

### 2. Redeploy with Terraform
```bash
cd ../../../terraform
terraform apply -target=module.document_management
```

Or redeploy the entire infrastructure:
```bash
terraform apply
```

### 3. Verify the Fix

#### Test Document List
```bash
curl -X GET https://YOUR_API_URL/dev/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Origin: http://localhost:5173" \
  -v
```

#### Test Document Upload
```bash
curl -X POST https://YOUR_API_URL/dev/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"filename":"test.pdf","fileSize":1024,"contentType":"application/pdf"}' \
  -v
```

#### Test Document Delete
```bash
curl -X DELETE https://YOUR_API_URL/dev/documents/DOC_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Origin: http://localhost:5173" \
  -v
```

Expected response headers for all:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Credentials: true
Content-Type: application/json
```

## CORS Configuration Overview

### API Gateway (Terraform)
The API Gateway has OPTIONS methods configured for CORS preflight:
- `/documents` OPTIONS
- `/documents/upload` OPTIONS
- `/documents/{documentId}` OPTIONS

These return the same CORS headers as the Lambda functions.

### Lambda Functions
All document Lambda functions now return consistent CORS headers in their responses.

## Complete CORS Headers Reference

### Required Headers for All Responses
```typescript
const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
};
```

### Why Each Header is Needed

1. **Access-Control-Allow-Origin**: Specifies which origins can access the resource
   - `*` allows all origins (suitable for public APIs)
   - For production, consider restricting to specific domains

2. **Access-Control-Allow-Headers**: Lists headers the client can send
   - `Content-Type`: For JSON payloads
   - `Authorization`: For JWT tokens
   - `X-Amz-*`: AWS signature headers

3. **Access-Control-Allow-Methods**: Lists allowed HTTP methods
   - Must include all methods used by the endpoint
   - Always include `OPTIONS` for preflight

4. **Access-Control-Allow-Credentials**: Allows cookies/credentials
   - Set to `'true'` (string) when using Authorization headers
   - Required when frontend uses `credentials: 'include'`

## Testing from Frontend

### Document Upload Test
```javascript
// In browser console
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;

fetch('https://YOUR_API_URL/dev/documents/upload', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        filename: 'test.pdf',
        fileSize: 1024,
        contentType: 'application/pdf'
    })
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));
```

### Document List Test
```javascript
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;

fetch('https://YOUR_API_URL/dev/documents', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
.then(response => response.json())
.then(data => console.log('Documents:', data))
.catch(error => console.error('Error:', error));
```

### Document Delete Test
```javascript
const token = JSON.parse(localStorage.getItem('chatbot_session_token')).token;
const documentId = 'YOUR_DOCUMENT_ID';

fetch(`https://YOUR_API_URL/dev/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
.then(response => response.json())
.then(data => console.log('Deleted:', data))
.catch(error => console.error('Error:', error));
```

## Best Practices

### 1. Shared CORS Headers Constant
Create a shared constant for CORS headers:

```typescript
// lambda/shared/api-response/src/cors.ts
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
};
```

### 2. Shared Response Helper
```typescript
// lambda/shared/api-response/src/index.ts
import { CORS_HEADERS } from './cors';

export function createApiResponse(
    statusCode: number,
    body: any,
    additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            ...additionalHeaders,
        },
        body: JSON.stringify(body),
    };
}
```

### 3. Use in Lambda Functions
```typescript
import { createApiResponse } from '../../../shared/api-response/src';

export const handler = async (event: APIGatewayProxyEvent) => {
    try {
        // Your logic here
        return createApiResponse(200, { success: true });
    } catch (error) {
        return createApiResponse(500, { error: 'Internal server error' });
    }
};
```

## Troubleshooting

### Still Getting CORS Errors?

1. **Check Browser Console**: Look for specific CORS error messages
2. **Verify Headers**: Use browser DevTools Network tab to inspect response headers
3. **Check API Gateway**: Ensure OPTIONS methods are deployed
4. **Lambda Logs**: Check CloudWatch logs for Lambda execution errors
5. **Cache**: Clear browser cache and try hard refresh (Ctrl+Shift+R)

### Common Issues

1. **403 Forbidden**: Usually means CORS headers are missing or incorrect
2. **Preflight Failed**: Check OPTIONS method configuration in API Gateway
3. **No 'Access-Control-Allow-Origin'**: Lambda function not returning CORS headers
4. **Credentials Issue**: Ensure `Access-Control-Allow-Credentials` is `'true'` (string)

### Debug Checklist

- [ ] Lambda functions rebuilt with `npm run build`
- [ ] Terraform applied to deploy changes
- [ ] API Gateway deployment created
- [ ] Browser cache cleared
- [ ] Correct API URL in frontend config
- [ ] Valid authentication token
- [ ] OPTIONS method returns 200 with CORS headers
- [ ] Actual request returns CORS headers

## Related Files
- `terraform/modules/rest-api/main.tf` - API Gateway CORS configuration
- `lambda/documents/list/src/index.ts` - List documents Lambda
- `lambda/documents/upload/src/index.ts` - Upload document Lambda
- `lambda/documents/delete/src/index.ts` - Delete document Lambda
- `frontend/src/components/DocumentUpload.tsx` - Frontend upload component
- `frontend/src/components/DocumentList.tsx` - Frontend list component

## Summary of All CORS Fixes

### Auth Endpoints
- ✅ `/auth/login` - Fixed
- ✅ `/auth/logout` - Fixed

### Document Endpoints
- ✅ `/documents` (GET) - Fixed
- ✅ `/documents/upload` (POST) - Fixed
- ✅ `/documents/{documentId}` (DELETE) - Fixed

All endpoints now return proper CORS headers in both OPTIONS (preflight) and actual responses.
