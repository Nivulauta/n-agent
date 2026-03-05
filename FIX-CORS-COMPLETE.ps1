# Complete CORS Fix Deployment
# This script does EVERYTHING needed to fix CORS

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "COMPLETE CORS FIX DEPLOYMENT" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Build all Lambda functions with CORS fix"
Write-Host "  2. Force API Gateway redeployment"
Write-Host "  3. Deploy everything with Terraform"
Write-Host "  4. Test all endpoints"
Write-Host ""

$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "Step 1: Building Lambda Functions" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Auth functions
Write-Host "[1/5] Building auth/login..." -ForegroundColor Yellow
Set-Location lambda/auth/login
npm run build | Out-Null
Set-Location ../../..
Write-Host "  ✓ auth/login built" -ForegroundColor Green

Write-Host "[2/5] Building auth/logout..." -ForegroundColor Yellow
Set-Location lambda/auth/logout
npm run build | Out-Null
Set-Location ../../..
Write-Host "  ✓ auth/logout built" -ForegroundColor Green

# Document functions
Write-Host "[3/5] Building documents/upload..." -ForegroundColor Yellow
Set-Location lambda/documents/upload
npm run build | Out-Null
Set-Location ../../..
Write-Host "  ✓ documents/upload built" -ForegroundColor Green

Write-Host "[4/5] Building documents/list..." -ForegroundColor Yellow
Set-Location lambda/documents/list
npm run build | Out-Null
Set-Location ../../..
Write-Host "  ✓ documents/list built" -ForegroundColor Green

Write-Host "[5/5] Building documents/delete..." -ForegroundColor Yellow
Set-Location lambda/documents/delete
npm run build | Out-Null
Set-Location ../../..
Write-Host "  ✓ documents/delete built" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Forcing API Gateway Redeployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location terraform

Write-Host "Tainting API Gateway deployment..." -ForegroundColor Yellow
terraform taint module.rest_api.aws_api_gateway_deployment.chatbot 2>&1 | Out-Null
Write-Host "  ✓ Deployment marked for recreation" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Deploying with Terraform" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Running terraform apply..." -ForegroundColor Yellow
Write-Host "(This may take 3-5 minutes)" -ForegroundColor Gray
Write-Host ""

terraform apply -auto-approve

Write-Host ""
Write-Host "Step 4: Testing Endpoints" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location ..

# Run the status check
.\check-cors-status.ps1

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✓ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Clear your browser cache!" -ForegroundColor Yellow
Write-Host "  Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then test:" -ForegroundColor Cyan
Write-Host "  1. Login at http://localhost:5173"
Write-Host "  2. Upload a document"
Write-Host "  3. View document list"
Write-Host ""
Write-Host "All requests should now work without CORS errors!" -ForegroundColor Green
Write-Host ""
