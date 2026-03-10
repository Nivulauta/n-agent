#!/bin/bash

# Automated deployment script for AWS S3 + CloudFront
# This script automatically retrieves bucket name and CloudFront distribution ID from Terraform outputs
# Usage: ./deploy-auto.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 AWS Claude RAG Agent - Frontend Deployment${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from the frontend directory"
    exit 1
fi

# Check if Terraform outputs are available
if [ ! -d "../terraform" ]; then
    echo -e "${RED}❌ Error: Terraform directory not found${NC}"
    echo "Please ensure the terraform directory exists at ../terraform"
    exit 1
fi

echo -e "${CYAN}📋 Retrieving deployment configuration from Terraform...${NC}"

# Get bucket name and CloudFront distribution ID from Terraform outputs
cd ../terraform
S3_BUCKET=$(terraform output -raw frontend_bucket_name 2>/dev/null)
CLOUDFRONT_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null)
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain_name 2>/dev/null)
cd ../frontend

if [ -z "$S3_BUCKET" ]; then
    echo -e "${RED}❌ Error: Could not retrieve S3 bucket name from Terraform${NC}"
    echo "Please ensure Terraform has been applied successfully"
    exit 1
fi

if [ -z "$CLOUDFRONT_DIST_ID" ]; then
    echo -e "${YELLOW}⚠️  Warning: Could not retrieve CloudFront distribution ID${NC}"
    echo "Deployment will continue without CloudFront cache invalidation"
fi

echo -e "${GREEN}✓ S3 Bucket: $S3_BUCKET${NC}"
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
    echo -e "${GREEN}✓ CloudFront Distribution: $CLOUDFRONT_DIST_ID${NC}"
fi
echo ""

# Build the React application
echo -e "${CYAN}🏗️  Building React application...${NC}"
if ! npm run build; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build completed successfully${NC}"
echo ""

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: dist directory not found after build${NC}"
    exit 1
fi

# Upload to S3
echo -e "${CYAN}📦 Uploading build artifacts to S3...${NC}"
echo "Bucket: s3://$S3_BUCKET"

# Sync all files except index.html with long cache
if ! aws s3 sync dist/ s3://$S3_BUCKET --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html"; then
    echo -e "${RED}❌ S3 sync failed!${NC}"
    exit 1
fi

# Upload index.html separately with no-cache to ensure updates are immediate
echo -e "${CYAN}📄 Uploading index.html with no-cache policy...${NC}"
if ! aws s3 cp dist/index.html s3://$S3_BUCKET/index.html \
    --cache-control "no-cache, no-store, must-revalidate" \
    --metadata-directive REPLACE; then
    echo -e "${RED}❌ index.html upload failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ S3 upload completed successfully${NC}"
echo ""

# Invalidate CloudFront cache if distribution ID is available
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
    echo -e "${CYAN}🔄 Invalidating CloudFront cache...${NC}"
    echo "Distribution: $CLOUDFRONT_DIST_ID"
    
    if INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_DIST_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text 2>&1); then
        echo -e "${GREEN}✓ CloudFront invalidation created: $INVALIDATION_ID${NC}"
        echo "Note: Invalidation may take 1-5 minutes to complete"
    else
        echo -e "${YELLOW}⚠️  CloudFront invalidation failed: $INVALIDATION_ID${NC}"
        echo "You may need to manually invalidate the cache"
    fi
    echo ""
fi

# Display deployment URLs
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${CYAN}📍 Access your application at:${NC}"
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo -e "${GREEN}   https://$CLOUDFRONT_DOMAIN${NC}"
else
    REGION=$(aws configure get region)
    echo -e "${GREEN}   https://$S3_BUCKET.s3-website-$REGION.amazonaws.com${NC}"
fi
echo ""
echo -e "${CYAN}💡 Tip: If you don't see your changes immediately, wait a few minutes for CloudFront cache invalidation to complete${NC}"
