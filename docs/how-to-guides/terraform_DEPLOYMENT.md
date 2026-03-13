# Terraform Infrastructure Deployment Guide

## Overview

This guide walks through deploying the complete AWS infrastructure for the Claude RAG Chatbot using Terraform.

## Prerequisites

### Required Tools

1. **Terraform** (>= 1.0)
   ```bash
   # Install via Homebrew (macOS)
   brew install terraform
   
   # Or download from https://www.terraform.io/downloads
   ```

2. **AWS CLI** (>= 2.0)
   ```bash
   # Install via Homebrew (macOS)
   brew install awscli
   
   # Configure with your credentials
   aws configure
   ```

### AWS Permissions

Your AWS user/role needs permissions to create:
- VPC, Subnets, Internet Gateway, NAT Gateway, VPC Endpoints
- S3 Buckets and Bucket Policies
- DynamoDB Tables
- OpenSearch Domains
- IAM Roles and Policies
- KMS Keys
- CloudWatch Log Groups and Alarms
- Security Groups

## Step-by-Step Deployment

### Step 1: Configure Variables

1. Copy the example variables file:
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` with your values:
   ```hcl
   aws_region = "us-east-1"
   environment = "dev"
   
   # VPC Configuration
   vpc_cidr             = "10.0.0.0/16"
   availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
   private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
   public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
   
   # OpenSearch Configuration
   opensearch_instance_type  = "t3.medium.search"
   opensearch_instance_count = 3
   ```

3. Set the OpenSearch master password as an environment variable:
   ```bash
   export TF_VAR_opensearch_master_user_password="YourStrongPassword123!"
   ```
   
   **Important**: Use a strong password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.

### Step 2: Initialize Terraform

```bash
terraform init
```

This will:
- Download required provider plugins (AWS)
- Initialize the backend
- Prepare modules

### Step 3: Review the Plan

```bash
terraform plan
```

Review the output carefully. You should see resources being created for:
- 1 VPC with subnets, NAT Gateway, and VPC endpoints
- 1 S3 bucket with encryption and versioning
- 4 DynamoDB tables
- 1 OpenSearch domain (3 nodes)
- Multiple IAM roles and policies
- Security groups
- CloudWatch log groups and alarms

Expected resource count: ~60-70 resources

### Step 4: Apply the Configuration

```bash
terraform apply
```

Type `yes` when prompted to confirm.

**Deployment Time**: 
- Most resources: 5-10 minutes
- OpenSearch domain: 15-30 minutes
- **Total**: ~30-40 minutes

### Step 5: Save the Outputs

After successful deployment, save the outputs:

```bash
terraform output > outputs.txt
```

You'll need these values for:
- Lambda function configuration
- API Gateway setup
- Frontend application configuration

## Important Outputs

Key outputs you'll need:

```
vpc_id                              # For Lambda VPC configuration
private_subnet_ids                  # For Lambda VPC configuration
s3_documents_bucket_name            # For document upload/processing
dynamodb_sessions_table_name        # For authentication
dynamodb_chat_history_table_name    # For chat persistence
dynamodb_rate_limits_table_name     # For rate limiting
dynamodb_document_metadata_table_name # For document tracking
opensearch_endpoint                 # For vector search
lambda_execution_role_arn           # For Lambda functions
kms_key_arn                         # For encryption
```

## Verification

### 1. Verify VPC and Networking

```bash
# Get VPC ID
VPC_ID=$(terraform output -raw vpc_id)

# Check VPC
aws ec2 describe-vpcs --vpc-ids $VPC_ID

# Check subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID"

# Check NAT Gateway
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC_ID"

# Check VPC Endpoints
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID"
```

### 2. Verify S3 Bucket

```bash
# Get bucket name
BUCKET_NAME=$(terraform output -raw s3_documents_bucket_name)

# Check bucket
aws s3 ls s3://$BUCKET_NAME/

# Verify encryption
aws s3api get-bucket-encryption --bucket $BUCKET_NAME

# Verify versioning
aws s3api get-bucket-versioning --bucket $BUCKET_NAME
```

### 3. Verify DynamoDB Tables

```bash
# List tables
aws dynamodb list-tables --query "TableNames[?contains(@, 'chatbot')]"

# Describe a table
aws dynamodb describe-table --table-name $(terraform output -raw dynamodb_sessions_table_name)
```

### 4. Verify OpenSearch Domain

```bash
# Get OpenSearch endpoint
OPENSEARCH_ENDPOINT=$(terraform output -raw opensearch_endpoint)

# Check domain status
aws opensearch describe-domain --domain-name dev-chatbot-opensearch

# Note: The domain must be in "Active" state before use
```

### 5. Verify IAM Roles

```bash
# List Lambda execution role
aws iam get-role --role-name $(terraform output -raw lambda_execution_role_arn | cut -d'/' -f2)

# List attached policies
aws iam list-attached-role-policies --role-name $(terraform output -raw lambda_execution_role_arn | cut -d'/' -f2)
```

### 6. Verify CloudWatch Log Groups

```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix "/aws/chatbot/dev"
```

## Troubleshooting

### OpenSearch Domain Creation Fails

**Issue**: OpenSearch domain creation times out or fails.

**Solutions**:
1. Check if you have service-linked role for OpenSearch:
   ```bash
   aws iam get-role --role-name AWSServiceRoleForAmazonOpenSearchService
   ```
   
2. If not, create it:
   ```bash
   aws iam create-service-linked-role --aws-service-name es.amazonaws.com
   ```

3. Verify subnet availability zones match your configuration

### VPC Endpoint Issues

**Issue**: VPC endpoints not working properly.

**Solutions**:
1. Ensure DNS resolution is enabled:
   ```bash
   aws ec2 describe-vpc-attribute --vpc-id $VPC_ID --attribute enableDnsSupport
   aws ec2 describe-vpc-attribute --vpc-id $VPC_ID --attribute enableDnsHostnames
   ```

2. Both should return `true`. If not, Terraform will enable them automatically.

### IAM Permission Errors

**Issue**: "Access Denied" errors during deployment.

**Solutions**:
1. Verify your AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Ensure you have necessary permissions (AdministratorAccess or equivalent)

3. Check for SCPs (Service Control Policies) that might restrict resource creation

### KMS Key Issues

**Issue**: Resources fail to use KMS encryption.

**Solutions**:
1. Verify KMS key was created:
   ```bash
   aws kms describe-key --key-id $(terraform output -raw kms_key_arn)
   ```

2. Check key policy allows service access

## Cost Estimation

Approximate monthly costs (us-east-1, moderate usage):

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| OpenSearch | 3x t3.medium.search | ~$150 |
| NAT Gateway | 1x with data transfer | ~$35 |
| DynamoDB | On-demand, moderate usage | ~$10 |
| S3 | 100GB storage | ~$2.30 |
| VPC Endpoints | 3 endpoints | ~$22 |
| CloudWatch Logs | 10GB/month | ~$5 |
| KMS | 1 key, 10K requests | ~$1 |
| **Total** | | **~$225/month** |

**Cost Optimization Tips**:
- Use t3.small.search for dev environments (~$50/month savings)
- Reduce OpenSearch to 1 node for dev (~$100/month savings)
- Enable S3 Intelligent-Tiering (already configured)
- Use DynamoDB on-demand (already configured)

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will permanently delete:
- All S3 data (documents)
- All DynamoDB data (chat history, sessions)
- All OpenSearch indices (vector embeddings)
- All CloudWatch logs

**Before destroying**:
1. Export any important data
2. Verify you have backups if needed
3. Confirm you want to delete everything

## Next Steps

After infrastructure deployment:

1. **Deploy Lambda Functions** (Task 2)
   - Use the `lambda_execution_role_arn` output
   - Configure VPC settings with `vpc_id` and `private_subnet_ids`
   - Set environment variables with DynamoDB table names and S3 bucket

2. **Configure API Gateway** (Task 3)
   - Create REST and WebSocket APIs
   - Link to Lambda functions
   - Configure authentication

3. **Set Up Document Processing** (Task 4)
   - Configure S3 event notifications
   - Deploy document processor Lambda
   - Test PDF upload and processing

4. **Deploy Frontend** (Task 5)
   - Build React application
   - Deploy to S3 + CloudFront
   - Configure API endpoints

## Support

For issues or questions:
1. Check AWS CloudWatch Logs for error messages
2. Review Terraform state: `terraform show`
3. Validate configuration: `terraform validate`
4. Check AWS Service Health Dashboard
