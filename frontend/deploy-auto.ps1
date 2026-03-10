# Automated deployment script for AWS S3 + CloudFront (PowerShell)
# This script automatically retrieves bucket name and CloudFront distribution ID from Terraform outputs
# Usage: .\deploy-auto.ps1

$ErrorActionPreference = "Stop"

Write-Host "AWS Claude RAG Agent - Frontend Deployment" -ForegroundColor Cyan
Write-Host ""

# Check if AWS CLI is installed
try {
    $null = Get-Command aws -ErrorAction Stop
}
catch {
    Write-Host "Error: AWS CLI is not installed" -ForegroundColor Red
    Write-Host "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
}

# Check if we're in the frontend directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: package.json not found" -ForegroundColor Red
    Write-Host "Please run this script from the frontend directory"
    exit 1
}

# Check if Terraform directory exists
if (-not (Test-Path "../terraform")) {
    Write-Host "Error: Terraform directory not found" -ForegroundColor Red
    Write-Host "Please ensure the terraform directory exists at ../terraform"
    exit 1
}

Write-Host "Retrieving deployment configuration from Terraform..." -ForegroundColor Cyan

# Get bucket name and CloudFront distribution ID from Terraform outputs
Push-Location ../terraform
try {
    $S3_BUCKET = terraform output -raw frontend_bucket_name 2>$null
    $CLOUDFRONT_DIST_ID = terraform output -raw cloudfront_distribution_id 2>$null
    $CLOUDFRONT_DOMAIN = terraform output -raw cloudfront_domain_name 2>$null
}
catch {
    Write-Host "Error: Failed to retrieve Terraform outputs" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

if ([string]::IsNullOrWhiteSpace($S3_BUCKET)) {
    Write-Host "Error: Could not retrieve S3 bucket name from Terraform" -ForegroundColor Red
    Write-Host "Please ensure Terraform has been applied successfully"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($CLOUDFRONT_DIST_ID)) {
    Write-Host "Warning: Could not retrieve CloudFront distribution ID" -ForegroundColor Yellow
    Write-Host "Deployment will continue without CloudFront cache invalidation"
}

Write-Host "S3 Bucket: $S3_BUCKET" -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($CLOUDFRONT_DIST_ID)) {
    Write-Host "CloudFront Distribution: $CLOUDFRONT_DIST_ID" -ForegroundColor Green
}
Write-Host ""

# Build the React application
Write-Host "Building React application..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build completed successfully" -ForegroundColor Green
Write-Host ""

# Check if dist directory exists
if (-not (Test-Path "dist")) {
    Write-Host "Error: dist directory not found after build" -ForegroundColor Red
    exit 1
}

# Upload to S3
Write-Host "Uploading build artifacts to S3..." -ForegroundColor Cyan
Write-Host "Bucket: s3://$S3_BUCKET"

# Sync all files except index.html with long cache
aws s3 sync dist/ s3://$S3_BUCKET --delete --cache-control "public, max-age=31536000, immutable" --exclude "index.html"

if ($LASTEXITCODE -ne 0) {
    Write-Host "S3 sync failed!" -ForegroundColor Red
    exit 1
}

# Upload index.html separately with no-cache to ensure updates are immediate
Write-Host "Uploading index.html with no-cache policy..." -ForegroundColor Cyan
aws s3 cp dist/index.html s3://$S3_BUCKET/index.html --cache-control "no-cache, no-store, must-revalidate" --metadata-directive REPLACE

if ($LASTEXITCODE -ne 0) {
    Write-Host "index.html upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "S3 upload completed successfully" -ForegroundColor Green
Write-Host ""

# Invalidate CloudFront cache if distribution ID is available
if (-not [string]::IsNullOrWhiteSpace($CLOUDFRONT_DIST_ID)) {
    Write-Host "Invalidating CloudFront cache..." -ForegroundColor Cyan
    Write-Host "Distribution: $CLOUDFRONT_DIST_ID"
    
    $INVALIDATION_ID = aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DIST_ID --paths "/*" --query 'Invalidation.Id' --output text 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "CloudFront invalidation created: $INVALIDATION_ID" -ForegroundColor Green
        Write-Host "Note: Invalidation may take 1-5 minutes to complete"
    }
    else {
        Write-Host "CloudFront invalidation failed: $INVALIDATION_ID" -ForegroundColor Yellow
        Write-Host "You may need to manually invalidate the cache"
    }
    Write-Host ""
}

# Display deployment URLs
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Access your application at:" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($CLOUDFRONT_DOMAIN)) {
    Write-Host "   https://$CLOUDFRONT_DOMAIN" -ForegroundColor Green
}
else {
    $REGION = aws configure get region
    Write-Host "   https://$S3_BUCKET.s3-website-$REGION.amazonaws.com" -ForegroundColor Green
}
Write-Host ""
Write-Host "Tip: If you don't see your changes immediately, wait a few minutes for CloudFront cache invalidation to complete" -ForegroundColor Cyan
