# Vector Store Lambda Functions - Quick Start

## Build and Deploy (Complete Process)

```bash
# 0. Verify setup (optional)
cd lambda/vector-store
bash verify-setup.sh

# 1. Build Lambda functions
bash build-all.sh

# 2. Deploy infrastructure
cd ../../terraform
terraform apply

# 3. Configure OpenSearch and initialize index
bash scripts/configure_opensearch_access.sh
```

Done! Your OpenSearch vector store is ready.

## What Each Step Does

### Step 1: Build Lambda Functions

Compiles TypeScript and bundles dependencies for both:
- `init-index` - Creates the OpenSearch index
- `configure-access` - Configures IAM role mappings

### Step 2: Deploy Infrastructure

Creates:
- OpenSearch domain (private VPC)
- Lambda functions
- IAM roles and policies
- Security groups
- CloudWatch log groups

### Step 3: Configure and Initialize

Automatically:
- Maps Lambda IAM role to OpenSearch role
- Creates the `documents` index with k-NN configuration
- Verifies everything works

## Troubleshooting

### "Cannot find module" Error

Lambda dependencies not included. Rebuild:

```bash
cd lambda/vector-store
bash build-all.sh
```

### "403 Forbidden" Error

Role mapping not configured. Run:

```bash
cd terraform
bash scripts/configure_opensearch_access.sh
```

### "Connection timeout" Error

VPC/security group issue. Check:

```bash
terraform output private_subnet_ids
terraform output lambda_security_group_id
```

### Build Errors

Clean and rebuild:

```bash
cd lambda/vector-store/init-index
npm run clean
npm run build:terraform

cd ../configure-access
npm run clean
npm run build:terraform
```

## Verify Deployment

### Check Lambda Functions

```bash
cd terraform

# List functions
terraform output vector_store_init_function_name
terraform output opensearch_configure_access_function_name

# View logs
aws logs tail /aws/lambda/dev-vector-store-init-index --follow
aws logs tail /aws/lambda/dev-opensearch-configure-access --follow
```

### Check OpenSearch

```bash
# Get endpoint
terraform output opensearch_endpoint

# Check index (requires VPC access)
curl -u admin:password https://ENDPOINT/_cat/indices
```

### Test End-to-End

```bash
# Get role ARN
LAMBDA_ROLE_ARN=$(terraform output -raw vector_store_init_lambda_role_arn)

# Configure access
aws lambda invoke \
  --function-name dev-opensearch-configure-access \
  --payload "{\"lambdaRoleArn\":\"${LAMBDA_ROLE_ARN}\"}" \
  response.json

# Initialize index
aws lambda invoke \
  --function-name dev-vector-store-init-index \
  --payload '{}' \
  response.json

cat response.json
```

## Next Steps

After successful deployment:

1. **Deploy document processing** (Task 10)
2. **Deploy embedding generator** (Task 8)
3. **Deploy vector store client** (Task 9.2)
4. **Upload test documents**
5. **Query the chatbot**

## Documentation

- [BUILD.md](./BUILD.md) - Detailed build instructions
- [OPENSEARCH_SETUP.md](../../terraform/OPENSEARCH_SETUP.md) - Setup guide
- [DEPLOYMENT_GUIDE.md](../../terraform/modules/vector-store-init/DEPLOYMENT_GUIDE.md) - Full deployment guide
- [TROUBLESHOOTING.md](../../terraform/modules/vector-store-init/TROUBLESHOOTING.md) - Troubleshooting guide

## Common Commands

```bash
# Build all Lambda functions
cd lambda/vector-store && bash build-all.sh

# Deploy infrastructure
cd terraform && terraform apply

# Configure OpenSearch
cd terraform && bash scripts/configure_opensearch_access.sh

# View logs
aws logs tail /aws/lambda/FUNCTION_NAME --follow

# Get outputs
cd terraform && terraform output

# Destroy everything
cd terraform && terraform destroy
```

## Architecture

```
Developer
    ↓
Build Script (build-all.sh)
    ↓
Terraform Apply
    ↓
┌─────────────────────────────────────┐
│  AWS Infrastructure                 │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ Configure    │→ │ OpenSearch  │ │
│  │ Access       │  │ (VPC)       │ │
│  │ Lambda (VPC) │  │             │ │
│  └──────────────┘  └─────────────┘ │
│         ↓                           │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ Vector Store │→ │ OpenSearch  │ │
│  │ Init Lambda  │  │ Index       │ │
│  │ (VPC)        │  │ (documents) │ │
│  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────┘
```

## Support

Issues? Check:
1. CloudWatch Logs for error details
2. [TROUBLESHOOTING.md](../../terraform/modules/vector-store-init/TROUBLESHOOTING.md)
3. [BUILD_FIX.md](./configure-access/BUILD_FIX.md) for module errors
4. AWS service health dashboard
