# CORS Wildcard Fix - Complete Summary

## Problem
Document upload and other API requests were failing with CORS error:
```
A cross-origin resource sharing (CORS) request was blocked because it was 
configured to include credentials and the Access-Control-Allow-Origin response 
header was set to a wildcard *. CORS requests may only include credentials for 
resources where the Access-Control-Allow-Origin header is not a wildcard.
```

## Root Cause
Two issues were causing the CORS errors:

1. **Backend**: Lambda functions were returning `Access-Control-Allow-Origin: *` (wildcard) combined with `Access-Control-Allow-Credentials: true`, which is forbidden by CORS specification when credentials are included.

2. **Frontend**: Requests were not including `credentials: 'include'` (fetch) or `withCredentials: true` (axios), which is required for cross-origin requests with authentication headers.

## Solution

### Backend Changes (Lambda Functions)

Changed all Lambda functions from:
```typescript
'Access-Control-Allow-Origin': '*'
```

To:
```typescript
function getCorsOrigin(): string {
    return process.env.CORS_ORIGIN || 'http://localhost:5173';
}

'Access-Control-Allow-Origin': getCorsOrigin()
```

**Files Modified:**
- `lambda/auth/login/src/index.ts`
- `lambda/auth/logout/src/index.ts`
- `lambda/documents/upload/src/index.ts`
- `lambda/documents/list/src/index.ts`
- `lambda/documents/delete/src/index.ts`

### Terraform Configuration

Added `CORS_ORIGIN` environment variable to Lambda functions:

**Files Modified:**
- `terraform/variables.tf` - Added `cors_origin` variable
- `terraform/main.tf` - Passed `cors_origin` to modules
- `terraform/modules/auth/variables.tf` - Added `cors_origin` variable
- `terraform/modules/auth/main.tf` - Added to Lambda environment
- `terraform/modules/document-management/variables.tf` - Added `cors_origin` variable
- `terraform/modules/document-management/main.tf` - Added to Lambda environment

### Frontend Changes

Added credentials to all API requests:

**Files Modified:**
- `frontend/src/components/DocumentUpload.tsx` - Added `credentials: 'include'`
- `frontend/src/components/DocumentList.tsx` - Added `credentials: 'include'` (2 places)
- `frontend/src/utils/axios.ts` - Added `withCredentials: true`
- `frontend/src/contexts/AuthContext.tsx` - Added `withCredentials: true`

## Deployment Steps

### 1. Build Lambda Functions
```bash
cd lambda/auth/login && npm run build && cd ../../..
cd lambda/auth/logout && npm run build && cd ../../..
cd lambda/documents/upload && npm run build && cd ../../..
cd lambda/documents/list && npm run build && cd ../../..
cd lambda/documents/delete && npm run build && cd ../../..
```

### 2. Deploy with Terraform
```bash
cd terraform
terraform apply
```

### 3. Restart Frontend
```bash
cd frontend
npm run dev
```

## Configuration

### Development (Default)
CORS origin defaults to `http://localhost:5173` (Vite dev server).

### Production
Set in `terraform/terraform.tfvars`:
```hcl
cors_origin = "https://your-production-domain.com"
```

Or via environment variable:
```bash
export TF_VAR_cors_origin="https://your-production-domain.com"
```

## Verification

### Browser DevTools
1. Open Network tab
2. Make a request (login, upload, etc.)
3. Check Response Headers:
   - `Access-Control-Allow-Origin: http://localhost:5173` (not `*`)
   - `Access-Control-Allow-Credentials: true`

### curl Test
```bash
curl -i -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  https://YOUR_API_URL/dev/auth/login
```

Should return:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

## Documentation Created

1. `lambda/CORS_WILDCARD_FIX.md` - Technical details of backend fix
2. `lambda/DEPLOY_CORS_WILDCARD_FIX.md` - Deployment guide
3. `frontend/CORS_CREDENTIALS_FIX.md` - Frontend changes
4. `frontend/CHAT_STREAMING_FIX.md` - Chat streaming fix (separate issue)
5. `CORS_FIX_SUMMARY.md` - This file

## Related Issues Fixed

While fixing CORS, also resolved:
- Chat window TypeScript error (console.log in JSX)
- Chat streaming state persistence issue

## Testing Checklist

- [ ] Login works without CORS errors
- [ ] Logout works without CORS errors
- [ ] Document upload works without CORS errors
- [ ] Document list loads without CORS errors
- [ ] Document delete works without CORS errors
- [ ] Chat messages send successfully
- [ ] Chat streaming responses display correctly
- [ ] RAG citations appear in chat

## Notes

- The CORS origin must match exactly (including protocol and port)
- For multiple origins, modify Lambda code to check against whitelist
- CloudFront can be used to set CORS headers at CDN level
- Lambda@Edge can dynamically set origin based on request

## Support

If issues persist:
1. Check CloudWatch logs for Lambda errors
2. Verify environment variables in Lambda console
3. Clear browser cache and hard reload
4. Test with curl to isolate frontend vs backend
5. Check browser console for detailed error messages
