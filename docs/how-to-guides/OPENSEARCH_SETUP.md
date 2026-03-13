# OpenSearch Setup - Quick Reference

## One-Command Setup

```bash
# Build Lambda functions
cd lambda/vector-store
bash build-all.sh

# Deploy and configure
cd ../../terraform
bash scripts/configure_opensearch_access.sh
```

That's it! This will:
1. ✅ Build both Lambda functions with dependencies
2. ✅ Get the Lambda role ARN
3. ✅ Configure OpenSearch access
4. ✅ Initialize the vector index
5. ✅ Verify everything works

## Manual Setup (If Needed)

### Step 1: Build Lambda Functions

```bash
cd lambda/vector-store/init-index && npm run build:terraform
cd ../configure-access && npm run build:terraform
```

### Step 2: Deploy Infrastructure

```bash
cd terraform
terraform apply
```

### Step 3: Configure Access

```bash
# Get the Lambda role ARN
LAMBDA_ROLE_ARN=$(terraform output -raw vector_store_init_lambda_role_arn)

# Configure OpenSearch access
aws lambda invoke \
  --function-name $(terraform output -raw opensearch_configure_access_function_name) \
  --payload "{\"lambdaRoleArn\":\"${LAMBDA_ROLE_ARN}\"}" \
  response.json

cat response.json
```

### Step 4: Initialize Index

```bash
aws lambda invoke \
  --function-name $(terraform output -raw vector_store_init_function_name) \
  --payload '{}' \
  response.json

cat response.json
```

## Expected Output

### Success Response (Configure Access)
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Successfully mapped Lambda role arn:aws:iam::123456789:role/dev-vector-store-init-role to OpenSearch role all_access\"}"
}
```

### Success Response (Init Index)
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

## Troubleshooting

### 403 Forbidden Error

Run the configure access step again:
```bash
cd terraform
bash scripts/configure_opensearch_access.sh
```

### Connection Timeout

Check VPC configuration:
```bash
# Verify Lambda is in private subnets
terraform output private_subnet_ids

# Verify security groups
terraform output lambda_security_group_id
```

### Build Errors

Clean and rebuild:
```bash
cd lambda/vector-store/init-index
rm -rf node_modules dist
npm install
npm run build
```

## Useful Commands

### View Logs

```bash
# Configure access Lambda logs
aws logs tail /aws/lambda/dev-opensearch-configure-access --follow

# Init index Lambda logs
aws logs tail /aws/lambda/dev-vector-store-init-index --follow
```

### Get Terraform Outputs

```bash
cd terraform

# All outputs
terraform output

# Specific output
terraform output opensearch_endpoint
terraform output vector_store_init_lambda_role_arn
```

### Re-run Configuration

```bash
cd terraform
bash scripts/configure_opensearch_access.sh
```

## Architecture

```
Developer → Configure Access Lambda (VPC) → OpenSearch (VPC)
                     ↓
            Enables IAM access
                     ↓
Developer → Vector Store Init Lambda (VPC) → OpenSearch (VPC)
                     ↓
            Creates 'documents' index with k-NN
```

## What Gets Created

1. **OpenSearch Domain** (private VPC)
   - 3-node cluster
   - k-NN plugin enabled
   - Fine-grained access control

2. **Configure Access Lambda**
   - Maps IAM roles to OpenSearch roles
   - Uses master username/password
   - One-time setup

3. **Vector Store Init Lambda**
   - Creates 'documents' index
   - Configures k-NN settings
   - Uses IAM authentication

4. **Supporting Resources**
   - IAM roles and policies
   - Security groups
   - CloudWatch log groups
   - VPC networking

## Next Steps

After successful setup:

1. ✅ OpenSearch index is ready
2. → Deploy document processing Lambda (Task 10)
3. → Deploy embedding generator (Task 8)
4. → Deploy vector store client (Task 9.2)
5. → Upload and process documents
6. → Query the chatbot with RAG

## Documentation

- [DEPLOYMENT_GUIDE.md](./modules/vector-store-init/DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [FIX_403_ERROR.md](./modules/vector-store-init/FIX_403_ERROR.md) - Fix 403 errors
- [TROUBLESHOOTING.md](./modules/vector-store-init/TROUBLESHOOTING.md) - Detailed troubleshooting
- [SOLUTION_SUMMARY.md](./modules/vector-store-init/SOLUTION_SUMMARY.md) - Technical solution overview

## Support

If you encounter issues:
1. Check CloudWatch Logs
2. Review documentation above
3. Verify VPC/security group configuration
4. Check AWS service health dashboard
