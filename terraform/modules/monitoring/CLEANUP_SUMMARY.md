# Monitoring Module Cleanup Summary

## Issue
The monitoring module was creating CloudWatch log groups that were never used by any Lambda functions or application code. This caused confusion when trying to find logs.

## Root Cause
Each Lambda module creates its own log group with the pattern `/aws/lambda/${function_name}`, but the monitoring module was creating generic log groups with different naming patterns that didn't match any actual Lambda function names.

## Orphaned Resources Removed

### 1. Lambda Auth Log Group ❌
```terraform
# REMOVED
resource "aws_cloudwatch_log_group" "lambda_auth" {
  name = "/aws/lambda/${var.environment}-chatbot-auth"
}
```
**Why**: No Lambda function named `${environment}-chatbot-auth` exists.
**Actual functions**: `${environment}-auth-login`, `${environment}-auth-logout`, `${environment}-api-authorizer`

### 2. Lambda Chat Log Group ❌
```terraform
# REMOVED
resource "aws_cloudwatch_log_group" "lambda_chat" {
  name = "/aws/lambda/${var.environment}-chatbot-chat"
}
```
**Why**: No Lambda function named `${environment}-chatbot-chat` exists.
**Actual function**: `${environment}-websocket-message` (the main chat handler)

### 3. Lambda WebSocket Log Group ❌
```terraform
# REMOVED
resource "aws_cloudwatch_log_group" "lambda_websocket" {
  name = "/aws/lambda/${var.environment}-chatbot-websocket"
}
```
**Why**: No Lambda function named `${environment}-chatbot-websocket` exists.
**Actual functions**: `${environment}-websocket-connect`, `${environment}-websocket-disconnect`, `${environment}-websocket-message`

### 4. Application Logs Group ❌
```terraform
# REMOVED
resource "aws_cloudwatch_log_group" "application_logs" {
  name = "/aws/chatbot/${var.environment}/application"
}
```
**Why**: No Lambda function or application code writes to this log group. It was never referenced anywhere in the codebase.

### 5. API Gateway Log Group ❌
```terraform
# REMOVED
resource "aws_cloudwatch_log_group" "api_gateway" {
  name = "/aws/apigateway/${var.environment}-chatbot"
}
```
**Why**: The rest-api module creates its own log group with a different name: `/aws/apigateway/${environment}-chatbot-api`
**Actual log groups**: 
- REST API: `/aws/apigateway/${environment}-chatbot-api` (rest-api module)
- WebSocket API: `/aws/apigateway/${environment}-websocket` (websocket module)

## Changes Made

### 1. Removed Orphaned Log Groups
- Deleted 5 unused log group resources from `terraform/modules/monitoring/main.tf`
- Added comments explaining that modules create their own log groups

### 2. Updated Outputs
- Removed references to deleted log groups from `terraform/modules/monitoring/outputs.tf`
- Kept only the log groups that are actually used:
  - `lambda_doc_processor` - Document processor Lambda
  - `lambda_embedding` - Embedding generator Lambda
  - `lambda_upload` - Upload handler Lambda
  - `audit_user_actions` - User action audit logs
  - `audit_api_calls` - API call audit logs
  - `audit_document_operations` - Document operation audit logs

### 3. Fixed CloudWatch Alarm
- Updated `high_latency` alarm to monitor the correct function:
  - **Before**: `${environment}-chatbot-chat` (doesn't exist)
  - **After**: `${environment}-websocket-message` (actual chat handler)

### 4. Configured WebSocket API Gateway Logging
- Added `access_log_settings` to WebSocket stage in `terraform/modules/websocket/main.tf`
- Now logs all WebSocket connections, disconnections, and messages
- Includes request ID, IP, route key, status, and error messages

### 5. Created Documentation
- `LOG_GROUP_MAPPING.md` - Maps expected log groups to actual locations
- `LOGGING_GUIDE.md` - Complete guide for finding and accessing logs
- `CLEANUP_SUMMARY.md` - This document

## Impact

### Before Cleanup
- 5 orphaned log groups created but never used
- Confusion about where logs are located
- Alarm monitoring non-existent function
- WebSocket API Gateway not logging access logs
- Wasted CloudWatch storage costs

### After Cleanup
- Only necessary log groups created
- Clear documentation of actual log locations
- Alarm monitoring correct function
- WebSocket API Gateway properly configured with access logging
- Reduced infrastructure clutter

## Verification Steps

After applying these changes:

1. **Apply Terraform changes**
   ```bash
   cd terraform
   terraform plan  # Review changes
   terraform apply # Apply cleanup
   ```

2. **Verify log groups exist**
   ```bash
   # List all Lambda log groups
   aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/${environment}-"
   ```

3. **Check actual logs**
   ```bash
   # View chat handler logs
   aws logs tail /aws/lambda/${environment}-websocket-message --follow
   
   # View auth logs
   aws logs tail /aws/lambda/${environment}-auth-login --follow
   ```

4. **Verify alarm**
   ```bash
   # Check alarm configuration
   aws cloudwatch describe-alarms --alarm-names "${environment}-chatbot-high-latency"
   ```

## Log Group Ownership

Going forward, log groups are created by their respective modules:

| Module | Creates Log Groups For |
|--------|------------------------|
| `auth` | Authorizer, Login, Logout |
| `websocket-handlers` | Connect, Disconnect, Message |
| `chat-history` | Chat History |
| `document-management` | Upload, List, Delete |
| `document-processor` | Document Processor, Embedding Generator |
| `vector-store-init` | Index Initialization |
| `opensearch-access-config` | Access Configuration |
| `rest-api` | API Gateway Access Logs, WAF Logs |
| `websocket` | WebSocket API Logs |
| `monitoring` | Audit Logs (user actions, API calls, document operations) |

This ensures log group names always match the actual Lambda function names.
