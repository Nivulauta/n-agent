# API Gateway CORS Wildcard Fix - Complete

## Problem Solved
The CORS error was caused by API Gateway's OPTIONS (preflight) responses returning `Access-Control-Allow-Origin: *` (wildcard), which is not allowed when the request includes credentials (`withCredentials: true`).

## Root Cause
While we fixed the Lambda functions to return specific origins, API Gateway handles OPTIONS (preflight) requests BEFORE they reach the Lambda functions. These OPTIONS responses were still configured with wildcard `*` in the Terraform configuration.

## Solution Applied

### 1. API Gateway OPTIONS Responses (Terraform)
Updated 6 OPTIONS integration responses in `terraform/modules/rest-api/main.tf`:

**Before:**
```terraform
response_parameters = {
  "method.response.header.Access-Control-Allow-Origin" = "'*'"
}
```

**After:**
```terraform
response_parameters = {
  "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
  "method.response.header.Access-Control-Allow-Credentials" = "'true'"
}
```

**Affected Endpoints:**
- `/auth/login` OPTIONS
- `/auth/logout` OPTIONS
- `/documents` OPTIONS
- `/documents/upload` OPTIONS
- `/documents/{documentId}` OPTIONS
- `/chat/history` OPTIONS

### 2. Added cors_origin Variable
- `terraform/variables.tf` - Added root variable (default: `http://localhost:5173`)
- `terraform/modules/rest-api/variables.tf` - Added module variable
- `terraform/main.tf` - Passed variable to rest-api module

### 3. Lambda Functions (Already Fixed)
Lambda functions already updated to use `process.env.CORS_ORIGIN` instead of `*`.

## Deployment Steps

### Build Lambda Functions (if not already done)
```bash
cd lambda/auth/login && npm run build && cd ../../..
cd lambda/auth/logout && npm run build && cd ../../..
cd lambda/documents/upload && npm run build && cd ../../..
cd lambda/documents/list && npm run build && cd ../../..
cd lambda/documents/delete && npm run build && cd ../../..
```

### Deploy with Terraform
```bash
cd terraform
terraform apply
```

**Note**: This will redeploy API Gateway, causing a brief service interruption (<1 minute).

## Verification

### Test OPTIONS (Preflight) Request
```bash
curl -i -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  https://gv1ucj9hg9.execute-api.us-east-2.amazonaws.com/dev/auth/login
```

Expected headers:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

### Test Actual Request
```bash
curl -i -X POST \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  https://gv1ucj9hg9.execute-api.us-east-2.amazonaws.com/dev/auth/login
```

Should also return:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

## Files Modified

### Terraform
- `terraform/variables.tf` - Added `cors_origin` variable
- `terraform/main.tf` - Added `cors_origin` to rest_api module call
- `terraform/modules/rest-api/variables.tf` - Added `cors_origin` variable
- `terraform/modules/rest-api/main.tf` - Updated 6 OPTIONS responses

### Lambda (Previously Fixed)
- `lambda/auth/login/src/index.ts`
- `lambda/auth/logout/src/index.ts`
- `lambda/documents/upload/src/index.ts`
- `lambda/documents/list/src/index.ts`
- `lambda/documents/delete/src/index.ts`

### Frontend (Previously Fixed)
- `frontend/src/components/DocumentUpload.tsx`
- `frontend/src/components/DocumentList.tsx`
- `frontend/src/utils/axios.ts`
- `frontend/src/contexts/AuthContext.tsx`

## Configuration

### Development (Default)
```hcl
cors_origin = "http://localhost:5173"
```

### Production
Edit `terraform/terraform.tfvars`:
```hcl
cors_origin = "https://your-production-domain.com"
```

## Why This Fix Was Needed

CORS with credentials requires:
1. **Client**: `credentials: 'include'` or `withCredentials: true`
2. **Server**: Specific origin (not `*`) + `Access-Control-Allow-Credentials: true`

The flow is:
1. Browser sends OPTIONS (preflight) → API Gateway responds
2. Browser sends actual request (POST/GET/DELETE) → Lambda responds

Both must return the correct headers. We fixed Lambda functions first, but API Gateway OPTIONS responses were still using wildcard.

## Troubleshooting

### Still seeing wildcard in OPTIONS
1. Verify Terraform applied: `terraform show | grep cors_origin`
2. Check API Gateway console → Stages → dev → Integration Response
3. Clear browser cache and hard reload

### Still seeing CORS errors
1. Verify frontend origin matches exactly (including protocol and port)
2. Check both OPTIONS and actual request headers in Network tab
3. Verify Lambda functions were rebuilt and redeployed
4. Check CloudWatch logs for errors

## Related Documentation
- `lambda/CORS_WILDCARD_FIX.md` - Lambda function changes
- `lambda/DEPLOY_CORS_WILDCARD_FIX.md` - Deployment guide
- `frontend/CORS_CREDENTIALS_FIX.md` - Frontend changes
- `CORS_FIX_SUMMARY.md` - Complete summary
