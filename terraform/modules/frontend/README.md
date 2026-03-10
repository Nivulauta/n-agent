# Frontend Module

This module creates the infrastructure for hosting the React frontend application as a static website on AWS S3 with CloudFront CDN distribution.

## Resources Created

### S3 Bucket
- **Purpose**: Static website hosting for React application
- **Naming**: `{environment}-chatbot-frontend-{account_id}`
- **Features**:
  - Versioning enabled for rollback capability
  - Server-side encryption (AES256)
  - Public access blocked (access only via CloudFront)
  - Static website configuration with index.html as default and error document

### CloudFront Origin Access Identity (OAI)
- **Purpose**: Secure access from CloudFront to S3 bucket
- **Configuration**: Allows CloudFront to access S3 objects without making the bucket public

### CloudFront Distribution
- **Purpose**: Global CDN for fast content delivery with HTTPS
- **Features**:
  - HTTPS enforced (redirect HTTP to HTTPS)
  - TLS 1.2+ minimum protocol version
  - Gzip compression enabled
  - Custom domain support (optional)
  - ACM certificate integration for custom domains
  - SPA routing support (404/403 → index.html)
  - Optimized caching behaviors:
    - Static assets (/static/*, /assets/*): 1 day default, 1 year max
    - HTML files: 5 minutes default, 1 hour max
    - Default: 1 hour default, 1 day max

### S3 Bucket Policy
- **CloudFront Access**: Allows GetObject access only from CloudFront OAI
- **TLS Enforcement**: Denies requests using TLS version < 1.2
- **SSL Only**: Denies all non-HTTPS requests

### Lifecycle Configuration
- **Old Version Cleanup**: Deletes non-current versions after 30 days
- **Multipart Upload Cleanup**: Aborts incomplete multipart uploads after 7 days

## Variables

### Required Variables
- `environment`: Environment name (dev, staging, prod)
- `account_id`: AWS Account ID

### Optional Variables
- `custom_domain`: Custom domain name for CloudFront (e.g., "app.example.com")
- `acm_certificate_arn`: ARN of ACM certificate for custom domain (required if custom_domain is set)
- `cloudfront_price_class`: CloudFront price class (default: "PriceClass_100")
  - `PriceClass_100`: US, Canada, Europe
  - `PriceClass_200`: US, Canada, Europe, Asia, Middle East, Africa
  - `PriceClass_All`: All edge locations

## Outputs

### S3 Outputs
- `frontend_bucket_name`: S3 bucket name for deployment scripts
- `frontend_bucket_arn`: S3 bucket ARN for IAM policies
- `frontend_bucket_regional_domain_name`: S3 regional domain name
- `frontend_bucket_website_endpoint`: S3 website endpoint

### CloudFront Outputs
- `cloudfront_distribution_id`: CloudFront distribution ID for cache invalidation
- `cloudfront_distribution_arn`: CloudFront distribution ARN
- `cloudfront_domain_name`: CloudFront domain name (e.g., d123456.cloudfront.net)
- `cloudfront_hosted_zone_id`: CloudFront Route 53 zone ID for alias records
- `cloudfront_oai_id`: CloudFront OAI ID
- `cloudfront_oai_iam_arn`: OAI IAM ARN
- `cloudfront_oai_path`: OAI path for origin configuration
- `frontend_url`: Complete URL to access the frontend (custom domain or CloudFront domain)

## Usage

### Basic Usage (Default CloudFront Certificate)

```hcl
module "frontend" {
  source = "./modules/frontend"

  environment = var.environment
  account_id  = local.account_id
}
```

### With Custom Domain

```hcl
module "frontend" {
  source = "./modules/frontend"

  environment           = var.environment
  account_id            = local.account_id
  custom_domain         = "app.example.com"
  acm_certificate_arn   = "arn:aws:acm:us-east-1:123456789012:certificate/abc123..."
  cloudfront_price_class = "PriceClass_200"
}
```

**Note**: ACM certificates for CloudFront must be created in the `us-east-1` region.

## Deployment Process

1. **Build React Application**:
   ```bash
   cd frontend
   npm run build
   ```

2. **Upload to S3**:
   ```bash
   aws s3 sync dist/ s3://$(terraform output -raw frontend_bucket_name)/ --delete
   ```

3. **Invalidate CloudFront Cache**:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id $(terraform output -raw cloudfront_distribution_id) \
     --paths "/*"
   ```

4. **Access the Application**:
   ```bash
   echo "Frontend URL: $(terraform output -raw frontend_url)"
   ```

## Caching Strategy

The module implements a multi-tier caching strategy optimized for React SPAs:

### Static Assets (Long Cache)
- **Paths**: `/static/*`, `/assets/*`
- **TTL**: 1 day default, 1 year maximum
- **Use Case**: Versioned/hashed assets (CSS, JS, images, fonts)

### HTML Files (Short Cache)
- **Paths**: `*.html`
- **TTL**: 5 minutes default, 1 hour maximum
- **Use Case**: Entry point files that may change with deployments

### Default (Medium Cache)
- **Paths**: All other files
- **TTL**: 1 hour default, 1 day maximum
- **Use Case**: General content

### SPA Routing Support
- **404/403 Errors**: Redirected to `/index.html` with 200 status
- **Purpose**: Enables client-side routing for React Router

## Security Features

- **Encryption at Rest**: AES256 server-side encryption
- **Encryption in Transit**: TLS 1.2+ enforced on CloudFront
- **Private Bucket**: All public access blocked
- **CloudFront Only Access**: S3 bucket accessible only via CloudFront OAI
- **Versioning**: Enabled for rollback and recovery
- **HTTPS Only**: HTTP requests redirected to HTTPS

## Custom Domain Setup

To use a custom domain:

1. **Create ACM Certificate** (in us-east-1):
   ```bash
   aws acm request-certificate \
     --domain-name app.example.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Validate Certificate**: Add DNS validation records to your domain

3. **Update Terraform Configuration**:
   ```hcl
   custom_domain       = "app.example.com"
   acm_certificate_arn = "arn:aws:acm:us-east-1:..."
   ```

4. **Create DNS Record**: Point your domain to CloudFront:
   ```
   app.example.com  CNAME  d123456.cloudfront.net
   ```
   Or use Route 53 alias record:
   ```hcl
   resource "aws_route53_record" "frontend" {
     zone_id = var.hosted_zone_id
     name    = "app.example.com"
     type    = "A"
     
     alias {
       name                   = module.frontend.cloudfront_domain_name
       zone_id                = module.frontend.cloudfront_hosted_zone_id
       evaluate_target_health = false
     }
   }
   ```

## Requirements

- Requirement 13.1: Infrastructure as Code Deployment
- Task 22.1: Create S3 bucket for static hosting with Terraform
- Task 22.2: Create CloudFront distribution with Terraform

## Next Steps

After this module is deployed:
1. Task 22.3: Create deployment script for automated builds and uploads
2. Configure CI/CD pipeline for automated deployments
