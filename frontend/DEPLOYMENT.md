# Frontend Deployment Guide

This guide explains how to deploy the React frontend application to AWS S3 and CloudFront.

## Overview

The frontend is deployed as a static website hosted on:
- **S3**: Stores the built React application files
- **CloudFront**: CDN for fast global delivery with HTTPS

## Prerequisites

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws configure
   ```

2. **Node.js and npm** installed
   ```bash
   node --version
   npm --version
   ```

3. **Terraform infrastructure** deployed (Tasks 22.1 and 22.2)
   - S3 bucket for frontend hosting
   - CloudFront distribution

## Deployment Scripts

We provide three deployment scripts:

### 1. Automated Deployment (Recommended)

**Bash (Linux/Mac):**
```bash
./deploy-auto.sh
```

**PowerShell (Windows):**
```powershell
.\deploy-auto.ps1
```

**Features:**
- ✅ Automatically retrieves S3 bucket name and CloudFront distribution ID from Terraform
- ✅ Builds the React application
- ✅ Uploads to S3 with optimized cache headers
- ✅ Invalidates CloudFront cache
- ✅ Comprehensive error handling
- ✅ Color-coded output

### 2. Manual Deployment

**Bash (Linux/Mac):**
```bash
./deploy.sh <s3-bucket-name> [cloudfront-distribution-id]
```

**PowerShell (Windows):**
```powershell
.\deploy.ps1 -BucketName <s3-bucket-name> [-DistributionId <cloudfront-distribution-id>]
```

**Example:**
```bash
# Get values from Terraform
cd ../terraform
BUCKET=$(terraform output -raw frontend_bucket_name)
DIST_ID=$(terraform output -raw cloudfront_distribution_id)
cd ../frontend

# Deploy
./deploy.sh $BUCKET $DIST_ID
```

## Deployment Process

The deployment scripts perform the following steps:

### 1. Build React Application
```bash
npm run build
```
- Compiles TypeScript to JavaScript
- Bundles with Vite
- Optimizes assets (minification, tree-shaking)
- Outputs to `dist/` directory

### 2. Upload to S3

**Static Assets** (JS, CSS, images):
```bash
aws s3 sync dist/ s3://<bucket> --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"
```
- Cache for 1 year (31536000 seconds)
- Immutable - files never change (content-hashed filenames)
- `--delete` removes old files

**index.html**:
```bash
aws s3 cp dist/index.html s3://<bucket>/index.html \
  --cache-control "no-cache, no-store, must-revalidate"
```
- No caching - ensures users always get latest version
- Critical for SPA routing and updates

### 3. Invalidate CloudFront Cache
```bash
aws cloudfront create-invalidation \
  --distribution-id <dist-id> \
  --paths "/*"
```
- Clears CloudFront edge cache
- Ensures users get updated content immediately
- Takes 1-5 minutes to complete

## Cache Strategy

Our caching strategy balances performance and update speed:

| File Type | Cache Duration | Reason |
|-----------|---------------|--------|
| `index.html` | No cache | Entry point - must be fresh for updates |
| JS/CSS/Assets | 1 year | Content-hashed filenames - safe to cache forever |

**How it works:**
1. Vite generates content-hashed filenames: `app.abc123.js`
2. When code changes, filename changes: `app.xyz789.js`
3. `index.html` references new filename
4. Users get new `index.html` (no cache) → loads new assets
5. Old assets remain cached but unused

## Verification

After deployment, verify the application:

### 1. Check S3 Upload
```bash
aws s3 ls s3://<bucket-name>/
```

Expected files:
```
index.html
assets/
  index-abc123.js
  index-xyz789.css
  logo-def456.svg
```

### 2. Test CloudFront URL
```bash
# Get CloudFront domain
cd ../terraform
terraform output cloudfront_domain_name

# Open in browser
https://<cloudfront-domain>
```

### 3. Check Browser Console
- No 404 errors
- Assets loading from CloudFront
- Application functioning correctly

## Troubleshooting

### Build Fails

**Error:** `npm run build` fails
```
❌ Build failed!
```

**Solutions:**
1. Install dependencies: `npm install`
2. Check TypeScript errors: `npm run lint`
3. Verify Node.js version: `node --version` (should be 18+)

### S3 Upload Fails

**Error:** `Access Denied` or `NoSuchBucket`

**Solutions:**
1. Check AWS credentials: `aws sts get-caller-identity`
2. Verify bucket exists: `aws s3 ls s3://<bucket-name>`
3. Check IAM permissions: `s3:PutObject`, `s3:DeleteObject`

### CloudFront Invalidation Fails

**Error:** `InvalidDistributionId` or `AccessDenied`

**Solutions:**
1. Verify distribution ID: `aws cloudfront list-distributions`
2. Check IAM permissions: `cloudfront:CreateInvalidation`
3. Wait for distribution to be deployed (status: `Deployed`)

### Changes Not Visible

**Issue:** Deployed but still seeing old version

**Solutions:**
1. **Hard refresh browser:** Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
2. **Clear browser cache:** Settings → Clear browsing data
3. **Wait for invalidation:** Check status:
   ```bash
   aws cloudfront get-invalidation \
     --distribution-id <dist-id> \
     --id <invalidation-id>
   ```
4. **Verify index.html updated:**
   ```bash
   curl -I https://<cloudfront-domain>/
   # Check Last-Modified header
   ```

### CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solutions:**
1. Check API Gateway CORS configuration (backend issue)
2. Verify `.env` file has correct API URLs
3. Rebuild and redeploy: `npm run build && ./deploy-auto.sh`

## Rollback

If deployment introduces issues, rollback to previous version:

### 1. List S3 Object Versions
```bash
aws s3api list-object-versions \
  --bucket <bucket-name> \
  --prefix index.html
```

### 2. Restore Previous Version
```bash
aws s3api copy-object \
  --bucket <bucket-name> \
  --copy-source <bucket-name>/index.html?versionId=<version-id> \
  --key index.html
```

### 3. Invalidate CloudFront
```bash
aws cloudfront create-invalidation \
  --distribution-id <dist-id> \
  --paths "/index.html"
```

## CI/CD Integration

For automated deployments, integrate with CI/CD pipelines:

### GitHub Actions Example
```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
        working-directory: ./frontend
      
      - name: Build
        run: npm run build
        working-directory: ./frontend
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-2
      
      - name: Deploy to S3
        run: ./deploy-auto.sh
        working-directory: ./frontend
```

## Cost Estimation

**S3 Storage:**
- Typical React app: 5-10 MB
- Cost: ~$0.023 per GB/month
- **Estimated: < $0.01/month**

**S3 Requests:**
- GET requests via CloudFront: Free
- PUT requests (deployments): ~100 per deployment
- Cost: $0.005 per 1,000 PUT requests
- **Estimated: < $0.01/month**

**CloudFront:**
- Data transfer: $0.085 per GB (first 10 TB)
- Requests: $0.0075 per 10,000 HTTPS requests
- **Estimated: $1-5/month** (depends on traffic)

**CloudFront Invalidations:**
- First 1,000 paths/month: Free
- Additional: $0.005 per path
- **Estimated: Free** (we invalidate `/*` = 1 path)

**Total: $1-5/month** for moderate traffic

## Security Best Practices

1. **HTTPS Only:** CloudFront enforces HTTPS
2. **Private S3 Bucket:** Only CloudFront can access (via OAI)
3. **No Public Access:** S3 public access blocked
4. **Versioning Enabled:** Allows rollback
5. **Encryption at Rest:** S3 server-side encryption (AES-256)

## Performance Optimization

1. **Content Hashing:** Vite generates hashed filenames
2. **Long Cache TTL:** Static assets cached for 1 year
3. **Compression:** CloudFront automatically compresses (gzip/brotli)
4. **CDN:** CloudFront edge locations worldwide
5. **HTTP/2:** CloudFront supports HTTP/2 for faster loading

## Monitoring

Monitor deployment health:

### CloudWatch Metrics
```bash
# CloudFront requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=<dist-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

### CloudFront Access Logs
Enable in Terraform for detailed request logs:
- Request paths
- Response codes
- User agents
- Geographic distribution

## Related Documentation

- [Terraform Frontend Deployment](../terraform/FRONTEND_DEPLOYMENT.md)
- [Frontend README](./README.md)
- [AWS S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/)

## Requirements Satisfied

✅ **Requirement 13.1**: Infrastructure as Code Deployment
- Deployment scripts automate build and upload process
- Integration with Terraform outputs
- Reproducible deployments

✅ **Task 22.3**: Create deployment script
- ✓ Build React app for production
- ✓ Upload build artifacts to S3
- ✓ Invalidate CloudFront cache after deployment
- ✓ Handle errors gracefully
