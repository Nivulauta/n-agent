# OpenSearch Access Configuration Lambda

## Purpose

This Lambda function configures OpenSearch role mapping to grant Lambda IAM roles access to OpenSearch when fine-grained access control is enabled.

## Problem It Solves

When OpenSearch has fine-grained access control enabled, IAM policies alone are not sufficient. You must also configure OpenSearch's internal security plugin to map IAM roles to OpenSearch roles.

Without this mapping, you'll see errors like:
```
no permissions for [indices:data/write/bulk] and User [name=arn:aws:iam::123456789012:role/my-lambda-role
```

## Usage

### Invoke the Lambda to Map a Role

```powershell
# Option 1: Using a payload file (use ASCII encoding, not UTF8)
@{
    lambdaRoleArn = "arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role"
    opensearchRole = "all_access"
} | ConvertTo-Json | Out-File -Encoding ascii payload.json

aws lambda invoke `
  --function-name dev-opensearch-configure-access `
  --payload file://payload.json `
  response.json

cat response.json

# Option 2: Using inline JSON (escape quotes with backslash)
aws lambda invoke `
  --function-name dev-opensearch-configure-access `
  --payload '{\"lambdaRoleArn\":\"arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role\"}' `
  response.json

# Option 3: Using base64 encoding (most reliable)
$payload = '{"lambdaRoleArn":"arn:aws:iam::177981160483:role/dev-websocket-message-role"}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$base64 = [Convert]::ToBase64String($bytes)
aws lambda invoke --function-name dev-opensearch-configure-access --payload $base64 response.json
cat response.json
```

### Parameters

- `lambdaRoleArn` (required): The ARN of the Lambda IAM role to grant access
- `opensearchRole` (optional): The OpenSearch role to map to (default: `all_access`)

### Example Response

Success:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Successfully mapped Lambda role arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role to OpenSearch role all_access\"}"
}
```

Already mapped:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Lambda role arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role is already mapped to all_access\"}"
}
```

Error:
```json
{
  "statusCode": 500,
  "body": "{\"error\":\"Failed to configure OpenSearch access\",\"message\":\"Connection timeout\"}"
}
```

## Common Roles to Map

### Generate Embeddings Lambda
```powershell
# Using inline JSON (recommended)
aws lambda invoke `
  --function-name dev-opensearch-configure-access `
  --payload '{\"lambdaRoleArn\":\"arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role\"}' `
  response.json
cat response.json
```

### Vector Store Init Lambda
```powershell
aws lambda invoke `
  --function-name dev-opensearch-configure-access `
  --payload '{\"lambdaRoleArn\":\"arn:aws:iam::177981160483:role/dev-vector-store-init-role\"}' `
  response.json
cat response.json
```

## Getting Lambda Role ARNs

### From Terraform State
```powershell
cd terraform

# Generate embeddings role
terraform state show module.document_processor.aws_iam_role.generate_embeddings | Select-String "arn"

# Vector store init role
terraform state show module.vector_store_init.aws_iam_role.init_index_role | Select-String "arn"
```

### From AWS Console
1. Go to IAM → Roles
2. Search for the role name (e.g., "generate-embeddings")
3. Copy the ARN from the role summary

## OpenSearch Roles

### all_access (Default)
Grants full access to OpenSearch:
- Create/delete indices
- Read/write documents
- Bulk operations
- Cluster management

### Custom Roles
For production, create custom roles with minimal permissions:

```json
{
  "cluster_permissions": [],
  "index_permissions": [{
    "index_patterns": ["documents"],
    "allowed_actions": [
      "indices:data/write/bulk",
      "indices:data/write/index",
      "indices:data/read/search"
    ]
  }]
}
```

Then map to the custom role:
```powershell
aws lambda invoke `
  --function-name dev-opensearch-configure-access `
  --payload '{\"lambdaRoleArn\":\"arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role\",\"opensearchRole\":\"custom_write_role\"}' `
  response.json
```

## Troubleshooting

### Lambda Timeout
The Lambda must run in the same VPC as OpenSearch. Check:
- Lambda is attached to VPC private subnets
- Security groups allow Lambda → OpenSearch communication
- OpenSearch is in the same VPC

### Authentication Failed
Check environment variables:
- `OPENSEARCH_ENDPOINT`: OpenSearch domain endpoint (without https://)
- `OPENSEARCH_MASTER_USER`: Master username (default: `admin`)
- `OPENSEARCH_MASTER_PASSWORD`: Master password from Terraform

### Role Already Mapped
This is not an error. The Lambda will return success if the role is already mapped.

## Verification

After mapping, verify the role mapping in OpenSearch:

```powershell
# Get OpenSearch endpoint
$endpoint = terraform output -raw opensearch_endpoint

# Get master password from tfvars
$password = "YourMasterPassword"

# Check role mapping
curl -X GET "https://${endpoint}/_plugins/_security/api/rolesmapping/all_access" `
  -u "admin:${password}"
```

You should see your Lambda role ARN in the `backend_roles` array.

## Automation

You can automate this by invoking the Lambda after Terraform deployment:

```powershell
# In your deployment script
cd terraform
terraform apply -auto-approve

# Map roles
$roles = @(
    "arn:aws:iam::177981160483:role/dev-chatbot-generate-embeddings-role",
    "arn:aws:iam::177981160483:role/dev-vector-store-init-role"
)

foreach ($role in $roles) {
    $payload = "{`"lambdaRoleArn`":`"$role`"}"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $base64 = [Convert]::ToBase64String($bytes)
    aws lambda invoke --function-name dev-opensearch-configure-access --payload $base64 response.json
    Write-Host "Mapped: $role"
    cat response.json
}
```
