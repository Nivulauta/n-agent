# CORS Fix for Auth Endpoints

## Problem
The `/auth/logout` endpoint was returning a CORS error when called from the frontend. While the API Gateway had OPTIONS (preflight) CORS configuration, the Lambda function responses were missing required CORS headers.

## Root Cause
The Lambda functions were only returning:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Credentials: true`

But browsers also need these headers in the actual response (not just OPTIONS):
- `Access-Control-Allow-Headers`
- `Access-Control-Allow-Methods`

## Solution
Updated the `createResponse` function in both login and logout Lambda functions to include all required CORS headers.

### Files Modified
1. `lambda/auth/logout/src/index.ts`
2. `lambda/auth/login/src/index.ts`

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
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
}
```

## Deployment Steps

### 1. Rebuild Lambda Functions
```bash
cd lambda/auth/logout
npm run build

cd ../login
npm run build
```

### 2. Redeploy with Terraform
```bash
cd ../../../terraform
terraform apply -target=module.auth
```

Or redeploy the entire infrastructure:
```bash
terraform apply
```

### 3. Verify the Fix
Test the logout endpoint from the frontend:
```javascript
// In browser console
fetch('https://YOUR_API_URL/dev/auth/logout', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json'
    }
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));
```

## CORS Configuration Overview

### API Gateway (Terraform)
The API Gateway has OPTIONS methods configured for CORS preflight:
- `/auth/login` OPTIONS
- `/auth/logout` OPTIONS

These return:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
- `Access-Control-Allow-Methods: POST,OPTIONS`

### Lambda Functions
The Lambda functions now return the same headers in their responses, ensuring CORS works for both preflight and actual requests.

## Testing

### Test Preflight (OPTIONS)
```bash
curl -X OPTIONS https://YOUR_API_URL/dev/auth/logout \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \
  -v
```

Expected response headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST,OPTIONS
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
```

### Test Actual Request (POST)
```bash
curl -X POST https://YOUR_API_URL/dev/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -v
```

Expected response headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
Access-Control-Allow-Methods: POST,OPTIONS
Access-Control-Allow-Credentials: true
Content-Type: application/json
```

## Best Practices

### 1. Consistent CORS Headers
All Lambda functions should return the same CORS headers for consistency:
```typescript
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
};
```

### 2. Shared Response Helper
Consider creating a shared utility for API responses:
```typescript
// lambda/shared/api-response/src/index.ts
export function createApiResponse(
    statusCode: number,
    body: any,
    additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Credentials': 'true',
            ...additionalHeaders,
        },
        body: JSON.stringify(body),
    };
}
```

### 3. Environment-Specific Origins
For production, consider restricting origins:
```typescript
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

function getCorsOrigin(requestOrigin?: string): string {
    if (ALLOWED_ORIGINS.includes('*')) return '*';
    if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
        return requestOrigin;
    }
    return ALLOWED_ORIGINS[0];
}
```

## Troubleshooting

### Still Getting CORS Errors?

1. **Check Browser Console**: Look for specific CORS error messages
2. **Verify Headers**: Use browser DevTools Network tab to inspect response headers
3. **Check API Gateway**: Ensure OPTIONS methods are deployed
4. **Lambda Logs**: Check CloudWatch logs for Lambda execution errors
5. **Cache**: Clear browser cache and try again

### Common Issues

1. **Missing Authorization Header**: Ensure `Authorization` is in `Access-Control-Allow-Headers`
2. **Credentials Mode**: If using `credentials: 'include'`, origin cannot be `*`
3. **Method Not Allowed**: Ensure the HTTP method is in `Access-Control-Allow-Methods`
4. **Preflight Failure**: Check OPTIONS method configuration in API Gateway

## Related Files
- `terraform/modules/rest-api/main.tf` - API Gateway CORS configuration
- `lambda/auth/login/src/index.ts` - Login Lambda function
- `lambda/auth/logout/src/index.ts` - Logout Lambda function
- `frontend/src/utils/auth.ts` - Frontend auth utilities
