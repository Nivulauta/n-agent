# CORS Wildcard Origin Fix

## Issue
When using `credentials: 'include'` in fetch requests or `withCredentials: true` in axios, browsers block requests if the server responds with `Access-Control-Allow-Origin: *` (wildcard). 

The error message:
```
A cross-origin resource sharing (CORS) request was blocked because it was configured 
to include credentials and the Access-Control-Allow-Origin response header of the 
request or the associated preflight request was set to a wildcard *. CORS requests 
may only include credentials for resources where the Access-Control-Allow-Origin 
header is not a wildcard.
```

## Root Cause
All Lambda functions were returning:
```typescript
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Credentials': 'true',
```

This combination is explicitly forbidden by the CORS specification when credentials are included.

## Solution
Changed all Lambda functions to use a specific origin instead of wildcard:

```typescript
function getCorsOrigin(): string {
    // In production, this should be set via environment variable
    // For now, allow localhost for development
    return process.env.CORS_ORIGIN || 'http://localhost:5173';
}

function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCorsOrigin(),  // Changed from '*'
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
            'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify(body),
    };
}
```

## Files Updated

### Auth Lambda Functions
- `lambda/auth/login/src/index.ts`
- `lambda/auth/logout/src/index.ts`

### Document Lambda Functions
- `lambda/documents/upload/src/index.ts`
- `lambda/documents/list/src/index.ts`
- `lambda/documents/delete/src/index.ts`

## Environment Variable Configuration

For production deployment, set the `CORS_ORIGIN` environment variable in Terraform:

```hcl
environment {
  variables = {
    CORS_ORIGIN = "https://your-production-domain.com"
    # ... other variables
  }
}
```

For development, the default is `http://localhost:5173` (Vite dev server).

## Deployment Steps

### 1. Build All Lambda Functions
```bash
# Auth functions
cd lambda/auth/login && npm run build && cd ../../..
cd lambda/auth/logout && npm run build && cd ../../..

# Document functions
cd lambda/documents/upload && npm run build && cd ../../..
cd lambda/documents/list && npm run build && cd ../../..
cd lambda/documents/delete && npm run build && cd ../../..
```

### 2. Deploy with Terraform
```bash
cd terraform
terraform apply
```

Or use the deployment script:
```bash
# Linux/Mac
./lambda/deploy-cors-fixes.sh

# Windows PowerShell
./lambda/deploy-cors-fixes.ps1
```

## Testing

After deployment, verify CORS headers:

1. Open browser DevTools → Network tab
2. Make a request (e.g., upload document, login)
3. Check response headers:
   - `Access-Control-Allow-Origin: http://localhost:5173` (not `*`)
   - `Access-Control-Allow-Credentials: true`
4. Request should succeed with 200 status

## Production Considerations

### Multiple Origins
If you need to support multiple origins (e.g., dev, staging, production), you can:

1. **Option 1**: Use environment variable per environment
   ```hcl
   # terraform/environments/dev/terraform.tfvars
   cors_origin = "http://localhost:5173"
   
   # terraform/environments/prod/terraform.tfvars
   cors_origin = "https://app.example.com"
   ```

2. **Option 2**: Check origin against whitelist in Lambda
   ```typescript
   function getCorsOrigin(requestOrigin?: string): string {
       const allowedOrigins = [
           'http://localhost:5173',
           'https://dev.example.com',
           'https://app.example.com'
       ];
       
       if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
           return requestOrigin;
       }
       
       return allowedOrigins[0]; // Default
   }
   ```

### CloudFront Distribution
If using CloudFront, you can:
1. Set CORS headers at CloudFront level
2. Use Lambda@Edge to dynamically set origin based on request
3. Configure CloudFront to forward `Origin` header to Lambda

## Related Documentation
- `lambda/CORS_DEPLOYMENT_GUIDE.md` - General CORS deployment guide
- `lambda/documents/CORS_FIX.md` - Document endpoints CORS fix
- `lambda/auth/CORS_FIX.md` - Auth endpoints CORS fix
- `frontend/CORS_CREDENTIALS_FIX.md` - Frontend credentials configuration

## CORS Specification Reference
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Fetch Standard: CORS Protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)
- Credentials mode requires specific origin (not wildcard)
