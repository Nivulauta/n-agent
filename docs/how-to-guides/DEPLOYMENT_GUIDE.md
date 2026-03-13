# Vector Store Init - Complete Deployment Guide

This guide walks you through deploying and configuring the OpenSearch vector store initialization.

## Overview

The deployment involves:
1. Building Lambda functions
2. Deploying infrastructure with Terraform
3. Configuring OpenSearch access (role mapping)
4. Initializing the OpenSearch index

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.0
- Node.js >= 22
- npm or yarn
- jq (for the automated script)

## Step-by-Step Deployment

### Step 1: Build Lambda Functions

```bash
# Build the vector-store-init Lambda
cd lambda/vector-store/init-index
npm run build:terraform

# Build the configure-access Lambda
cd ../configure-access
npm run build:terraform

cd ../../..
```

### Step 2: Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform (first time only)
terraform init

# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

This will create:
- OpenSearch domain (in VPC)
- Vector store init Lambda function
- Configure access Lambda function
- All necessary IAM roles and policies
- VPC networking components
- Security groups

### Step 3: Configure OpenSearch Access

**Option A: Automated Script (Recommended)**

```bash
cd terraform
bash scripts/configure_opensearch_access.sh
```

This script will:
1. Get the Lambda role ARN
2. Invoke the configure-access Lambda
3. Test the vector-store-init Lambda
4. Confirm the index was created

**Option B: Manual Steps**

```bash
# Get the Lambda role ARN
cd terraform
LAMBDA_ROLE_ARN=$(terraform output -raw vector_store_init_lambda_role_arn)

# Invoke the configuration Lambda
aws lambda invoke \
  --function-name dev-opensearch-configure-access \
  --payload "{\"lambdaRoleArn\":\"${LAMBDA_ROLE_ARN}\"}" \
  response.json

# Check the response
cat response.json

# Test the init Lambda
aws lambda invoke \
  --function-name dev-vector-store-init-index \
  --payload '{}' \
  response.json

cat response.json
```

### Step 4: Verify Deployment

Check that the OpenSearch index was created:

```bash
# View CloudWatch Logs
aws logs tail /aws/lambda/dev-vector-store-init-index --follow

# Or check the response from Step 3
# Should see: "Index 'documents' created successfully with k-NN configuration"
```

## Troubleshooting

### Build Errors

**Error: "Cannot find module"**
```bash
# Clean and rebuild
cd lambda/vector-store/init-index
rm -rf node_modules dist
npm install
npm run build
```

### Terraform Errors

**Error: "Error creating Lambda function"**

Check that the dist folder exists and contains compiled code:
```bash
ls -la lambda/vector-store/init-index/dist/
ls -la lambda/vector-store/configure-access/dist/
```

**Error: "InvalidParameterValueException: The role defined for the function cannot be assumed by Lambda"**

Wait a few seconds for IAM role propagation, then retry:
```bash
terraform apply
```

### Lambda Invocation Errors

**Error: "403 Forbidden" from vector-store-init**

The role mapping hasn't been configured yet. Run Step 3 again.

**Error: "Connection timeout"**

Check VPC configuration:
```bash
# Verify Lambda is in correct subnets
terraform output private_subnet_ids

# Verify security groups allow Lambda → OpenSearch
terraform output lambda_security_group_id
```

**Error: "401 Unauthorized" from configure-access**

The OpenSearch master password is incorrect. Update in terraform.tfvars:
```hcl
opensearch_master_password = "YourCorrectPassword"
```

Then reapply:
```bash
terraform apply
```

### OpenSearch Errors

**Error: "Index already exists"**

This is normal - the function is idempotent. The index was already created.

**Error: "Cluster health is RED"**

Wait for OpenSearch cluster to become healthy:
```bash
# Check cluster status (requires VPC access)
curl -u admin:password https://OPENSEARCH_ENDPOINT/_cluster/health
```

## Verification Checklist

- [ ] Lambda functions built successfully
- [ ] Terraform apply completed without errors
- [ ] Configure-access Lambda invoked successfully
- [ ] Vector-store-init Lambda invoked successfully
- [ ] OpenSearch index "documents" created
- [ ] CloudWatch logs show no errors

## Next Steps

After successful deployment:

1. **Deploy Document Processing Lambda** (Task 10)
   - Extracts text from PDFs
   - Generates embeddings
   - Stores in OpenSearch

2. **Deploy Embedding Generator** (Task 8)
   - Generates vector embeddings using Bedrock Titan

3. **Deploy Vector Store Client** (Task 9.2)
   - Searches the OpenSearch index
   - Returns relevant document chunks

4. **Test End-to-End**
   - Upload a PDF document
   - Wait for processing
   - Query the chatbot
   - Verify RAG responses include document citations

## Cleanup

To remove all resources:

```bash
cd terraform
terraform destroy
```

**Warning:** This will delete:
- OpenSearch domain and all indexed documents
- Lambda functions
- CloudWatch logs
- All other infrastructure

## Cost Estimates

Approximate monthly costs (us-east-1):

| Resource | Configuration | Monthly Cost |
|----------|--------------|--------------|
| OpenSearch | 3x t3.medium.search | ~$150 |
| Lambda (init) | Minimal usage | < $1 |
| Lambda (config) | Minimal usage | < $1 |
| CloudWatch Logs | 365-day retention | ~$5 |
| VPC | NAT Gateway | ~$32 |
| **Total** | | **~$188** |

## Security Best Practices

1. **Rotate OpenSearch master password** regularly
2. **Store credentials in Secrets Manager** (not in terraform.tfvars)
3. **Use custom OpenSearch roles** with minimal permissions
4. **Enable audit logging** in OpenSearch
5. **Restrict Lambda IAM roles** to least privilege
6. **Enable VPC Flow Logs** for network monitoring

## Support

For issues:
1. Check CloudWatch Logs for detailed error messages
2. Review [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. Review [FIX_403_ERROR.md](./FIX_403_ERROR.md)
4. Check AWS service health dashboard

## Additional Resources

- [OpenSearch Documentation](https://opensearch.org/docs/latest/)
- [AWS Lambda VPC Configuration](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
- [OpenSearch Fine-Grained Access Control](https://opensearch.org/docs/latest/security/access-control/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
