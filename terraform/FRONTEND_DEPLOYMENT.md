# Frontend Infrastructure Deployment Guide

This guide covers the deployment of the S3 bucket for static website hosting, which is part of Task 22.1.

## Overview

The frontend module creates:
- S3 bucket configured for static website hosting
- Versioning enabled for rollback capability
- CloudFront Origin Access Identity (OAI) for secure access
- Bucket policy allowing CloudFront access only
- Lifecycle rules for version cleanup

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- Existing infrastructure (VPC, networking, etc.) deployed

## Deployment Steps

### 1. Initialize Terraform (if not already done)

```bash
cd terraform
terraform init -upgrade
```

### 2. Validate Configuration

```bash
terraform validate
```

### 3. Review Changes

```bash
terraform plan -out=tfplan
```

Look for the following resources to be created:
- `module.frontend.aws_s3_bucket.frontend`
- `module.frontend.aws_s3_bucket_versioning.frontend`
- `module.frontend.aws_s3_bucket_server_side_encryption_configuration.frontend`
- `module.frontend.aws_s3_bucket_public_access_block.frontend`
- `module.frontend.aws_s3_bucket_website_configuration.frontend`
- `module.frontend.aws_cloudfront_origin_access_identity.frontend`
- `module.frontend.aws_s3_bucket_policy.frontend`
- `module.frontend.aws_s3_bucket_lifecycle_configuration.frontend`

### 4. Apply Changes

```bash
terraform apply tfplan
```

### 5. Verify Outputs

After successful deployment, retrieve the outputs:

```bash
terraform output frontend_bucket_name
terraform output cloudfront_oai_id
terraform output cloudfront_oai_iam_arn
```

## Configuration Details

### S3 Bucket Configuration

**Bucket Name Format**: `{environment}-chatbot-frontend-{account_id}`

**Features**:
- **Versioning**: Enabled - allows rollback to previous versions
- **Encryption**: AES256 server-side encryption
- **Public Access**: Blocked - bucket is private
- **Website Hosting**: Enabled with index.html as default document
- **Error Document**: index.html (for React Router support)

### Security Configuration

**Bucket Policy**:
1. **CloudFront Access**: Allows `s3:GetObject` from CloudFront OAI only
2. **TLS Enforcement**: Denies requests with TLS version < 1.2
3. **HTTPS Only**: Denies all non-secure transport requests

**Public Access Block**:
- Block public ACLs: ✓
- Block public policy: ✓
- Ignore public ACLs: ✓
- Restrict public buckets: ✓

### Lifecycle Rules

1. **Cleanup Old Versions**:
   - Deletes non-current versions after 30 days
   - Reduces storage costs

2. **Abort Incomplete Uploads**:
   - Aborts incomplete multipart uploads after 7 days
   - Prevents storage waste

## Outputs Reference

| Output | Description | Usage |
|--------|-------------|-------|
| `frontend_bucket_name` | S3 bucket name | Deployment scripts, AWS CLI commands |
| `frontend_bucket_arn` | S3 bucket ARN | IAM policies, resource references |
| `frontend_bucket_website_endpoint` | S3 website endpoint | Direct S3 access (testing only) |
| `cloudfront_oai_id` | CloudFront OAI ID | CloudFront distribution configuration |
| `cloudfront_oai_iam_arn` | OAI IAM ARN | Already used in bucket policy |
| `cloudfront_oai_path` | OAI path | CloudFront origin configuration |

## Deploying Frontend Application

After the infrastructure is created, deploy your React application:

### 1. Build the React Application

```bash
cd frontend
npm install
npm run build
```

### 2. Upload to S3

Get the bucket name:
```bash
BUCKET_NAME=$(cd ../terraform && terraform output -raw frontend_bucket_name)
```

Sync the build directory:
```bash
aws s3 sync dist/ s3://$BUCKET_NAME/ --delete
```

### 3. Verify Upload

```bash
aws s3 ls s3://$BUCKET_NAME/
```

### 4. Test Website Endpoint (Optional)

Get the website endpoint:
```bash
WEBSITE_ENDPOINT=$(cd ../terraform && terraform output -raw frontend_bucket_website_endpoint)
echo "Website endpoint: http://$WEBSITE_ENDPOINT"
```

**Note**: Direct S3 website access is for testing only. Production access should be via CloudFront (Task 22.2).

## Rollback Capability

With versioning enabled, you can rollback to a previous version:

### List Object Versions

```bash
aws s3api list-object-versions --bucket $BUCKET_NAME --prefix index.html
```

### Restore Previous Version

```bash
aws s3api copy-object \
  --bucket $BUCKET_NAME \
  --copy-source $BUCKET_NAME/index.html?versionId=VERSION_ID \
  --key index.html
```

## Troubleshooting

### Issue: Terraform plan takes too long

**Cause**: Lambda archive file generation in other modules
**Solution**: The frontend module itself is lightweight. Wait for the plan to complete or run `terraform plan -target=module.frontend`

### Issue: Access Denied when uploading to S3

**Cause**: Insufficient IAM permissions
**Solution**: Ensure your AWS credentials have `s3:PutObject` permission for the bucket

### Issue: Website endpoint returns 403 Forbidden

**Cause**: Bucket policy blocks direct access (by design)
**Solution**: Access should be via CloudFront. Direct S3 access is blocked for security.

## Cost Estimation

**S3 Storage**:
- Standard storage: ~$0.023 per GB/month
- Typical React app: 5-10 MB
- Estimated cost: < $0.01/month

**S3 Requests**:
- GET requests via CloudFront: Free (CloudFront handles)
- PUT requests (deployments): Negligible

**Total Estimated Cost**: < $1/month (excluding CloudFront)

## Next Steps

1. **Task 22.2**: Create CloudFront distribution
   - Configure CloudFront with S3 origin
   - Use the OAI created in this task
   - Enable HTTPS with ACM certificate
   - Configure caching behavior

2. **Task 22.3**: Create deployment script
   - Automate build and upload process
   - Invalidate CloudFront cache after deployment
   - Add CI/CD integration

## Requirements Satisfied

- ✓ **Requirement 13.1**: Infrastructure as Code Deployment
  - S3 bucket defined in Terraform
  - Versioning enabled for rollback
  - Bucket policy configured for CloudFront access

## Related Documentation

- [Frontend Module README](./modules/frontend/README.md)
- [Main Deployment Guide](./DEPLOYMENT.md)
- [AWS S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [CloudFront with S3 Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
