# Vector Store Init Index - Deployment Guide

This guide walks through deploying the OpenSearch index initialization Lambda function using Terraform.

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Terraform installed** (version >= 1.0)
3. **Node.js and npm installed** (for building the Lambda function)
4. **OpenSearch cluster deployed** via the opensearch module
5. **VPC and networking configured** via the networking module

## Step 1: Build the Lambda Function

Before running Terraform, build the Lambda function:

```bash
cd lambda/vector-store/init-index
bash build-for-terraform.sh
```

This script will:
- Install npm dependencies
- Compile TypeScript to JavaScript
- Copy node_modules to the dist directory
- Prepare the function for Terraform's archive_file data source

## Step 2: Verify Terraform Configuration

The module is already included in `terraform/main.tf`:

```hcl
module "vector_store_init" {
  source = "./modules/vector-store-init"

  environment            = var.environment
  opensearch_endpoint    = module.opensearch.endpoint
  opensearch_domain_arn  = module.opensearch.domain_arn
  subnet_ids             = module.networking.private_subnet_ids
  security_group_ids     = [module.security.lambda_security_group_id]
  aws_region             = local.region
}
```

## Step 3: Deploy with Terraform

From the terraform directory:

```bash
cd terraform

# Initialize Terraform (if not already done)
terraform init

# Plan the deployment
terraform plan

# Apply the changes
terraform apply
```

Terraform will:
1. Create a zip archive from `lambda/vector-store/init-index/dist/`
2. Create the IAM role with OpenSearch and VPC permissions
3. Deploy the Lambda function with VPC configuration
4. Create the CloudWatch log group

## Step 4: Invoke the Lambda Function

After deployment, invoke the function to create the OpenSearch index:

### Option A: Using AWS CLI

```bash
aws lambda invoke \
  --function-name dev-vector-store-init-index \
  --payload '{}' \
  response.json

cat response.json
```

Expected response:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

### Option B: Using AWS Console

1. Navigate to AWS Lambda console
2. Find the function: `<environment>-vector-store-init-index`
3. Click "Test" tab
4. Create a test event with empty payload: `{}`
5. Click "Test" button
6. Verify success in the execution results

### Option C: Automated with Terraform

Add this to your Terraform configuration to automatically invoke after deployment:

```hcl
# In terraform/main.tf or a separate file

resource "null_resource" "invoke_vector_store_init" {
  depends_on = [module.vector_store_init]

  provisioner "local-exec" {
    command = <<EOF
      aws lambda invoke \
        --function-name ${module.vector_store_init.function_name} \
        --payload '{}' \
        --region ${var.aws_region} \
        response.json && \
      cat response.json
    EOF
  }

  # Only run once per deployment
  triggers = {
    lambda_version = module.vector_store_init.function_arn
  }
}
```

## Step 5: Verify Index Creation

Check that the index was created successfully:

### Using AWS CLI with OpenSearch endpoint

```bash
# Get the OpenSearch endpoint from Terraform output
OPENSEARCH_ENDPOINT=$(terraform output -raw opensearch_endpoint)

# Check if index exists (requires AWS credentials)
aws opensearch describe-domain --domain-name <your-domain-name>
```

### Using OpenSearch Dashboards

1. Navigate to OpenSearch Dashboards (Kibana)
2. Go to "Dev Tools" console
3. Run: `GET /documents`
4. Verify the index mapping includes the k-NN configuration

Expected response should show:
- 1024-dimension knn_vector field
- HNSW algorithm configuration
- All metadata fields (chunkId, documentId, etc.)

## Troubleshooting

### Build Errors

**Error**: `dist directory not found`
- **Solution**: Ensure `npm run build` completes successfully
- Check `tsconfig.json` has correct `outDir` setting

**Error**: `node_modules not found`
- **Solution**: Run `npm install` before building

### Terraform Errors

**Error**: `Error creating Lambda function: InvalidParameterValueException`
- **Solution**: Verify the dist directory exists and contains index.js
- Run the build script again: `bash build-for-terraform.sh`

**Error**: `Error: error configuring Terraform AWS Provider: no valid credential sources`
- **Solution**: Configure AWS CLI credentials: `aws configure`

### Lambda Invocation Errors

**Error**: `Task timed out after 60.00 seconds`
- **Cause**: Lambda cannot reach OpenSearch cluster
- **Solution**: 
  - Verify Lambda is in the same VPC as OpenSearch
  - Check security group rules allow Lambda → OpenSearch traffic (port 443)
  - Verify NAT Gateway is configured for outbound internet access

**Error**: `User: arn:aws:sts::xxx:assumed-role/xxx is not authorized to perform: es:ESHttpPut`
- **Cause**: IAM role lacks OpenSearch permissions
- **Solution**: Verify the IAM policy includes `es:ESHttpPut` on the OpenSearch domain ARN

**Error**: `connect ETIMEDOUT`
- **Cause**: Network connectivity issue
- **Solution**:
  - Verify OpenSearch endpoint is correct
  - Check VPC networking configuration
  - Ensure Lambda security group allows outbound HTTPS (port 443)

### Index Already Exists

If you see: `Index 'documents' already exists`
- This is normal - the function is idempotent
- The index was already created in a previous invocation
- No action needed

## Updating the Lambda Function

To update the Lambda function code:

1. Make changes to `lambda/vector-store/init-index/src/index.ts`
2. Rebuild: `bash build-for-terraform.sh`
3. Reapply Terraform: `terraform apply`

Terraform will detect the source code change and update the Lambda function.

## Cleanup

To remove the Lambda function:

```bash
terraform destroy -target=module.vector_store_init
```

Note: This does NOT delete the OpenSearch index. To delete the index, you must do so manually through the OpenSearch API or Dashboards.

## Cost Considerations

- **Lambda invocations**: Free tier includes 1M requests/month
- **Lambda duration**: Minimal cost (~$0.0000002 per 100ms)
- **CloudWatch Logs**: $0.50 per GB ingested
- **VPC networking**: No additional cost for ENIs

Expected cost for this function: < $1/month (mostly CloudWatch Logs)

## Security Best Practices

1. **Least Privilege IAM**: The role only has permissions for OpenSearch and CloudWatch Logs
2. **VPC Isolation**: Lambda runs in private subnets with no direct internet access
3. **Encryption**: All logs are encrypted at rest in CloudWatch
4. **Audit Trail**: All invocations are logged to CloudWatch

## Next Steps

After successfully deploying and invoking this function:

1. Verify the index exists in OpenSearch
2. Proceed to Task 9.2: Implement OpenSearch client wrapper
3. Begin document processing pipeline (Task 10)

## Related Documentation

- [Lambda Function README](../../../lambda/vector-store/init-index/README.md)
- [Implementation Summary](../../../lambda/vector-store/init-index/IMPLEMENTATION_SUMMARY.md)
- [OpenSearch Module](../opensearch/README.md)
- [Networking Module](../networking/README.md)
