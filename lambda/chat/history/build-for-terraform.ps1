# Build script for Chat History Lambda
# This script now delegates to the cross-platform Node.js build script

$ErrorActionPreference = "Stop"

Write-Host "Building Chat History Lambda..." -ForegroundColor Green
Write-Host "Using Node.js build script for cross-platform compatibility..." -ForegroundColor Yellow

# Run the Node.js build script
node build.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Creating deployment package..." -ForegroundColor Yellow

# Remove existing zip if present
if (Test-Path "dist/lambda-chat-history.zip") {
    Remove-Item "dist/lambda-chat-history.zip"
}

# Create zip file
Compress-Archive -Path "dist/*" -DestinationPath "dist/lambda-chat-history.zip" -CompressionLevel Optimal

$size = (Get-Item "dist/lambda-chat-history.zip").Length / 1MB
Write-Host ""
Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host "📦 Deployment package: dist/lambda-chat-history.zip" -ForegroundColor Cyan
Write-Host "📏 Package size: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
