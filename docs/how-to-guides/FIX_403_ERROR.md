# Fix 403 Forbidden Error - Quick Guide

## Problem

The Lambda function returns a 403 error when trying to access OpenSearch:
```
Error initializing OpenSearch index
```

## Root Cause

OpenSearch has **Fine-Grained Access Control** enabled with a master user/password. The Lambda function uses IAM authentication, but the Lambda IAM role hasn't been mapped to an OpenSearch role yet.

## Quick Fix - Use the Configuration Lambda (Recommended)

Since OpenSearch is in a private VPC and not accessible from the public internet, we use a special Lambda function that runs inside the VPC to configure the role mapping.

### Step 1: Deploy the Configuration Lambda

```bash
# Build the configuration Lambda
cd lambda/vector-store/configure-access
npm install
npm run build

# Deploy with Terraform (if not already deployed)
cd ../../../terraform
terraform apply
```

### Step 2: Get the Lambda Role ARN

```bash
cd terraform
LAMBDA_ROLE_ARN=$(terraform output -raw vector_store_init_lambda_role_arn)
echo "Lambda Role ARN: $LAMBDA_ROLE_ARN"
```

### Step 3: Invoke the Configuration Lambda

```bash
aws lambda invoke \
  --function-name dev-opensearch-configure-access \
  --payload "{\"lambdaRoleArn\":\"${LAMBDA_ROLE_ARN}\"}" \
  response.json

cat response.json
```

Expected response:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Successfully mapped Lambda role...\"}"
}
```

## Alternative Methods (If You Have VPC Access)

### Method 1: Using OpenSearch Dashboards UI

If you can access OpenSearch Dashboards (via VPN, bastion host, or VPC peering):

1. Get the OpenSearch Dashboards URL:
   ```bash
   terraform output opensearch_kibana_endpoint
   ```

2. Log in with master username/password

3. Navigate to: **Security → Roles → all_access → Mapped users**

4. Click "Map users"

5. Add the Lambda role ARN as a **Backend role**:
   ```bash
   terraform output -raw vector_store_init_lambda_role_arn
   ```

6. Click "Map"

### Method 2: Using AWS Systems Manager Session Manager

If you have a bastion host or EC2 instance in the VPC:

```bash
# Connect to instance via Session Manager
aws ssm start-session --target i-1234567890abcdef0

# On the instance, run:
LAMBDA_ROLE_ARN="arn:aws:iam::123456789:role/dev-vector-store-init-role"
OPENSEARCH_ENDPOINT="search-dev-chatbot-xyz.us-east-1.es.amazonaws.com"

curl -X PUT "https://${OPENSEARCH_ENDPOINT}/_plugins/_security/api/rolesmapping/all_access" \
  -u "admin:YOUR_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d "{\"backend_roles\": [\"${LAMBDA_ROLE_ARN}\"]}"
```

## Verify the Fix

Test the Lambda function:

```bash
aws lambda invoke \
  --function-name $(terraform output -raw vector_store_init_function_name) \
  --payload '{}' \
  response.json

cat response.json
```

Expected success response:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

## What This Does

The role mapping tells OpenSearch: "When a request comes from this Lambda IAM role, treat it as having `all_access` permissions."

This allows the Lambda function to:
- Create indices
- Index documents
- Search documents
- Delete documents

## Security Note

In production, you should:
1. Create a custom OpenSearch role with minimal permissions
2. Map the Lambda role to that custom role instead of `all_access`
3. Store the master password in AWS Secrets Manager
4. Rotate credentials regularly

## Troubleshooting

**Still getting 403?**
- Wait 30 seconds for the role mapping to propagate
- Check CloudWatch Logs for detailed error messages
- Verify the Lambda is in the correct VPC and subnets
- Verify security groups allow Lambda → OpenSearch traffic

**Connection timeout?**
- Lambda must be in the same VPC as OpenSearch
- Check NAT Gateway is configured for outbound traffic
- Verify route tables are correct

**SSL errors?**
- Ensure you're using HTTPS
- Don't include `https://` in the OPENSEARCH_ENDPOINT environment variable

## Need Help?

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more detailed information.
