# CORS Fixes Deployment Guide

## Overview
This guide explains how to deploy the CORS header fixes to all auth and document Lambda functions.

## What Was Fixed

### Lambda Functions Updated
1. **lambda/auth/login/src/index.ts** - Added CORS headers
2. **lambda/auth/logout/src/index.ts** - Added CORS headers
3. **lambda/documents/upload/src/index.ts** - Added CORS headers
4. **lambda/documents/list/src/index.ts** - Added CORS headers
5. **lambda/documents/delete/src/index.ts** - Added CORS headers

### CORS Headers Added
```typescript
headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
}
```

## Deployment Methods

### Method 1: Automated Script (Recommended)

#### On Linux/Mac:
```bash
cd lambda
chmod +x deploy-cors-fixes.sh
./deploy-cors-fixes.sh
```

#### On Windows (PowerShell):
```powershell
cd lambda
.\deploy-cors-fixes.ps1
```

The script will:
1. Build all auth Lambda functions
2. Build all document Lambda functions
3. Deploy auth module with Terraform
4. Deploy document management module with Terraform

### Method 2: Manual Deployment

#### Step 1: Build Shared Modules (if needed)
```bash
cd lambda/shared/audit-logger
npm run build

cd ../vector-store
npm run build
```

#### Step 2: Build Auth Lambdas
```bash
cd lambda/auth/login
npm run build

cd ../logout
npm run build
```

#### Step 3: Build Document Lambdas
```bash
cd lambda/documents/upload
npm run build

cd ../list
npm run build

cd ../delete
npm run build
```

#### Step 4: Deploy with Terraform
```bash
cd terraform

# Deploy auth module
terraform apply -target=module.auth

# Deploy document management module
terraform apply -target=module.document_management
```

### Method 3: Deploy Everything
If you want to deploy all infrastructure changes:

```bash
cd terraform
terraform apply
```

**Note:** This will deploy all Terraform changes, not just the Lambda functions.

## Verification

### Step 1: Check Lambda Deployment
```bash
# Check auth Lambda versions
aws lambda get-function --function-name dev-login --query 'Configuration.LastModified'
aws lambda get-function --function-name dev-logout --query 'Configuration.LastModified'

# Check document Lambda versions
aws lambda get-function --function-name dev-document-upload --query 'Configuration.LastModified'
aws lambda get-function --function-name dev-document-list --query 'Configuration.LastModified'
aws lambda get-function --function-name dev-document-delete --query 'Configuration.LastModified'
```

### Step 2: Test CORS Headers

#### Test Login Endpoint
```bash
curl -X OPTIONS https://YOUR_API_URL/dev/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

Expected response headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST,OPTIONS
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
```

#### Test Document Upload Endpoint
```bash
curl -X OPTIONS https://YOUR_API_URL/dev/documents/upload \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

#### Test Actual Request (POST)
```bash
curl -X POST https://YOUR_API_URL/dev/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"filename":"test.pdf","fileSize":1024,"contentType":"application/pdf"}' \
  -v
```

Expected response headers should include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Credentials: true
```

### Step 3: Test from Frontend
1. Open your frontend application (http://localhost:5173)
2. Log in
3. Try to upload a document
4. Check browser console for CORS errors
5. Check Network tab to verify response headers

## Troubleshooting

### Build Errors

#### "npm: command not found"
**Solution:** Install Node.js and npm
```bash
# Check if installed
node --version
npm --version
```

#### "Cannot find module"
**Solution:** Install dependencies first
```bash
cd lambda/auth/login
npm install
npm run build
```

#### "Permission denied: build.mjs"
**Solution:** Make script executable (Linux/Mac)
```bash
chmod +x build.mjs
```

### Terraform Errors

#### "No changes. Infrastructure is up-to-date."
**Cause:** Lambda code changed but Terraform doesn't detect it

**Solution:** Force Lambda update by changing source_code_hash or using `terraform taint`
```bash
terraform taint module.auth.aws_lambda_function.login
terraform apply -target=module.auth
```

#### "Error: error configuring Terraform AWS Provider"
**Cause:** AWS credentials not configured

**Solution:** Configure AWS credentials
```bash
aws configure
```

### CORS Still Not Working

#### Check 1: Lambda Deployed
Verify Lambda was actually updated:
```bash
aws lambda get-function --function-name dev-document-upload \
  --query 'Configuration.[LastModified,CodeSize]'
```

#### Check 2: API Gateway Deployment
API Gateway needs a new deployment to pick up Lambda changes:
```bash
# In Terraform, this should happen automatically
# But you can force it by updating the deployment resource
terraform apply -target=module.rest_api.aws_api_gateway_deployment.chatbot
```

#### Check 3: Browser Cache
Clear browser cache and hard refresh (Ctrl+Shift+R)

#### Check 4: Check CloudWatch Logs
```bash
# View recent logs
aws logs tail /aws/lambda/dev-document-upload --follow
```

Look for the response being returned and verify headers are included.

## Rollback

If deployment causes issues, rollback:

```bash
cd terraform

# Rollback to previous state
terraform apply -target=module.auth -auto-approve
terraform apply -target=module.document_management -auto-approve
```

Or restore from Terraform state backup:
```bash
cp terraform.tfstate.backup terraform.tfstate
terraform apply
```

## Post-Deployment Checklist

- [ ] All Lambda functions built successfully
- [ ] Terraform apply completed without errors
- [ ] OPTIONS requests return CORS headers
- [ ] POST/GET/DELETE requests return CORS headers
- [ ] Frontend can make requests without CORS errors
- [ ] Document upload works from frontend
- [ ] Document list works from frontend
- [ ] Document delete works from frontend
- [ ] Login works from frontend
- [ ] Logout works from frontend

## Deployment Time Estimate

- Building Lambda functions: 2-5 minutes
- Terraform deployment: 3-5 minutes
- Total: 5-10 minutes

## Related Files

- `lambda/auth/login/src/index.ts` - Login Lambda with CORS
- `lambda/auth/logout/src/index.ts` - Logout Lambda with CORS
- `lambda/documents/upload/src/index.ts` - Upload Lambda with CORS
- `lambda/documents/list/src/index.ts` - List Lambda with CORS
- `lambda/documents/delete/src/index.ts` - Delete Lambda with CORS
- `lambda/auth/CORS_FIX.md` - Auth CORS fix documentation
- `lambda/documents/CORS_FIX.md` - Document CORS fix documentation
- `terraform/modules/rest-api/main.tf` - API Gateway CORS configuration

## Support

If you encounter issues:
1. Check CloudWatch logs for Lambda errors
2. Verify API Gateway deployment
3. Test with curl to isolate frontend vs backend issues
4. Check browser console for specific CORS error messages
5. Verify AWS credentials and permissions
