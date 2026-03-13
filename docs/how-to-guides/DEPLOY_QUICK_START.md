# Quick Start: Frontend Deployment

## TL;DR

Deploy the frontend in one command:

**Windows (PowerShell):**
```powershell
.\deploy-auto.ps1
```

**Linux/Mac (Bash):**
```bash
./deploy-auto.sh
```

That's it! The script will:
1. ✅ Build the React app
2. ✅ Upload to S3
3. ✅ Invalidate CloudFront cache
4. ✅ Show you the live URL

## Prerequisites

- AWS CLI installed and configured
- Node.js and npm installed
- Terraform infrastructure deployed (tasks 22.1 and 22.2)

## What Happens

```
🚀 AWS Claude RAG Agent - Frontend Deployment

📋 Retrieving deployment configuration from Terraform...
✓ S3 Bucket: dev-chatbot-frontend-177981160483
✓ CloudFront Distribution: EEGWYQEG3EMUN

🏗️  Building React application...
✓ Build completed successfully

📦 Uploading build artifacts to S3...
✓ S3 upload completed successfully

🔄 Invalidating CloudFront cache...
✓ CloudFront invalidation created: I5CRRWBNFSYWY

🎉 Deployment completed successfully!

📍 Access your application at:
   https://d2r0882e96pfi.cloudfront.net
```

## Manual Deployment

If you need more control:

**Windows:**
```powershell
.\deploy.ps1 -BucketName <bucket-name> -DistributionId <dist-id>
```

**Linux/Mac:**
```bash
./deploy.sh <bucket-name> <dist-id>
```

Get values from Terraform:
```bash
cd ../terraform
terraform output frontend_bucket_name
terraform output cloudfront_distribution_id
```

## Troubleshooting

### Build Fails
```bash
npm install  # Install dependencies
npm run lint # Check for errors
```

### AWS CLI Not Found
Install from: https://aws.amazon.com/cli/

### Changes Not Visible
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Wait 1-5 minutes for CloudFront invalidation
- Clear browser cache

## Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for:
- Detailed deployment process
- Cache strategy explanation
- Rollback procedures
- CI/CD integration
- Cost estimation
- Security best practices

## Requirements Satisfied

✅ **Task 22.3**: Create deployment script
- Build React app for production
- Upload build artifacts to S3
- Invalidate CloudFront cache after deployment
- Handle errors gracefully
