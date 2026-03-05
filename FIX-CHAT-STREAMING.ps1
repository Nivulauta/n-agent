#!/usr/bin/env pwsh
# Fix Chat Streaming - Complete Deployment Script
# This script fixes the issue where chat response content disappears on completion

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fix Chat Streaming Issue" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Issues Fixed:" -ForegroundColor Yellow
Write-Host "  1. Chat response content disappears on completion" -ForegroundColor Gray
Write-Host "  2. Authorizer returning cached authorization decisions" -ForegroundColor Gray
Write-Host ""
Write-Host "Solutions:" -ForegroundColor Green
Write-Host "  1. Backend now sends full accumulated content in complete message" -ForegroundColor Gray
Write-Host "  2. API Gateway authorizer cache disabled (TTL = 0)" -ForegroundColor Gray
Write-Host ""

$ErrorActionPreference = "Stop"

try {
    # Step 1: Rebuild WebSocket Message Lambda
    Write-Host "Step 1: Rebuilding WebSocket Message Lambda..." -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    $lambdaDir = "lambda/websocket/message"
    
    if (-not (Test-Path $lambdaDir)) {
        Write-Host "Error: Lambda directory not found: $lambdaDir" -ForegroundColor Red
        exit 1
    }

    Push-Location $lambdaDir
    
    Write-Host "  Installing dependencies..." -ForegroundColor Gray
    npm install | Out-Null
    
    Write-Host "  Building Lambda..." -ForegroundColor Gray
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Build failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host "  Build complete!" -ForegroundColor Green
    Write-Host ""

    # Step 2: Deploy with Terraform
    Write-Host "Step 2: Deploying with Terraform..." -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    Push-Location terraform
    
    Write-Host "  Running terraform apply..." -ForegroundColor Gray
    terraform apply -auto-approve
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Terraform apply failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host "  Deployment complete!" -ForegroundColor Green
    Write-Host ""

    # Step 3: Summary
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Deployment Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Changes deployed:" -ForegroundColor White
    Write-Host "  Backend: WebSocket message handler now sends full content in complete message" -ForegroundColor Gray
    Write-Host "  Frontend: Updated to use content from complete message payload" -ForegroundColor Gray
    Write-Host "  Authorizer: Cache disabled (TTL = 0) to prevent stale policies" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor White
    Write-Host "  2. Refresh the frontend application" -ForegroundColor White
    Write-Host "  3. Test chat streaming - messages should now persist after completion" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}
