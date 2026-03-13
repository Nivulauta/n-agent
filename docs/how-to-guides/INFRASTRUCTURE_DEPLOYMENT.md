# Infrastructure Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [AWS Permissions Required](#aws-permissions-required)
4. [Environment Variables and Configuration](#environment-variables-and-configuration)
5. [Step-by-Step Deployment](#step-by-step-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)
8. [Cost Optimization](#cost-optimization)
9. [Security Best Practices](#security-best-practices)
10. [Cleanup and Teardown](#cleanup-and-teardown)

## Overview

This guide provides comprehensive instructions for deploying the AWS Claude RAG Chatbot infrastructure using Terraform. The system deploys a complete serverless architecture including:

- **Networking**: VPC with public/private subnets, NAT Gateway, VPC endpoints
- **Compute**: Lambda functions for authentication, chat, document processing, and WebSocket handling
- **Storage**: S3 buckets with encryption and versioning
- **Database**: DynamoDB tables for sessions, chat history, rate limiting, and document metadata
- **Search**: OpenSearch cluster with k-NN plugin for vector search
- **Caching**: ElastiCache Redis for response and search result caching
- **Security**: IAM roles, KMS encryption, security groups
- **Monitoring**: CloudWatch logs, metrics, and alarms
- **Frontend**: S3 + CloudFront distribution for React application

**Deployment Time**: Approximately 30-45 minutes
**Estimated Monthly Cost**: $150-$250 (depending on usage and configuration)

## Prerequisites

### Required Tools


#### 1. Terraform (>= 1.0)

Install Terraform from the official website or using a package manager:

```bash
# macOS (Homebrew)
brew install terraform

# Windows (Chocolatey)
choco install terraform

# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Verify installation
terraform version
```

#### 2. AWS CLI (>= 2.0)

Install and configure the AWS CLI:

```bash
# macOS (Homebrew)
brew install awscli

# Windows (MSI Installer)
# Download from: https://awscli.amazonaws.com/AWSCLIV2.msi

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify installation
aws --version

# Configure AWS credentials
aws configure
```

When running `aws configure`, provide:
- **AWS Access Key ID**: Your IAM user access key
- **AWS Secret Access Key**: Your IAM user secret key
- **Default region**: e.g., `us-east-1`
- **Default output format**: `json`

#### 3. Node.js and npm (>= 20.x)

Required for building Lambda functions:

```bash
# macOS (Homebrew)
brew install node@20

# Windows (Installer)
# Download from: https://nodejs.org/

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```


#### 4. Git

Required for cloning the repository:

```bash
# macOS (Homebrew)
brew install git

# Windows (Installer)
# Download from: https://git-scm.com/download/win

# Linux (Ubuntu/Debian)
sudo apt-get install git

# Verify installation
git --version
```

### System Requirements

- **Operating System**: macOS, Linux, or Windows with WSL2
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: At least 2GB free space
- **Internet Connection**: Required for downloading dependencies and accessing AWS services

## AWS Permissions Required

Your AWS IAM user or role must have permissions to create and manage the following services:

### Core Services
- **VPC**: Create VPCs, subnets, route tables, internet gateways, NAT gateways
- **EC2**: Create security groups, VPC endpoints
- **S3**: Create buckets, configure bucket policies, enable versioning and encryption
- **DynamoDB**: Create tables, configure TTL, enable encryption
- **Lambda**: Create functions, configure VPC settings, set environment variables
- **IAM**: Create roles, policies, and service-linked roles
- **KMS**: Create and manage encryption keys
- **CloudWatch**: Create log groups, metric alarms, and dashboards

### Additional Services
- **OpenSearch**: Create and configure OpenSearch domains
- **ElastiCache**: Create Redis clusters
- **API Gateway**: Create REST and WebSocket APIs
- **CloudFront**: Create distributions (for frontend)
- **Secrets Manager**: Create and read secrets
- **SNS**: Create topics and subscriptions (for notifications)

### Recommended IAM Policy

For production deployments, use a custom policy with least privilege. For development/testing, you can use the following managed policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:*",
        "s3:*",
        "dynamodb:*",
        "lambda:*",
        "iam:*",
        "kms:*",
        "logs:*",
        "es:*",
        "elasticache:*",
        "apigateway:*",
        "cloudfront:*",
        "secretsmanager:*",
        "sns:*"
      ],
      "Resource": "*"
    }
  ]
}
```

**Note**: For production, restrict the `Resource` field to specific ARNs and use condition keys to limit permissions.

### Verify Your Permissions

```bash
# Check your current identity
aws sts get-caller-identity

# Test if you can create an S3 bucket (dry run)
aws s3api create-bucket --bucket test-permissions-check-$(date +%s) --region us-east-1 --dry-run 2>&1 | grep -q "DryRunOperation" && echo "S3 permissions OK" || echo "S3 permissions MISSING"
```


## Environment Variables and Configuration

### Required Configuration Files

#### 1. Terraform Variables File

Create `terraform/terraform.tfvars` with your environment-specific values:

```hcl
# AWS Configuration
aws_region  = "us-east-1"
environment = "dev"

# VPC Configuration
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# OpenSearch Configuration
opensearch_instance_type  = "t3.medium.search"
opensearch_instance_count = 3

# Redis Cache Configuration
redis_node_type                  = "cache.t3.micro"
redis_num_cache_nodes            = 1
redis_snapshot_retention_limit   = 0
redis_enable_encryption_at_rest  = false
redis_enable_encryption_in_transit = false

# Notifications (optional)
alert_email = "your-email@example.com"
```

**Configuration Options Explained**:

- **aws_region**: AWS region for deployment (e.g., `us-east-1`, `us-west-2`)
- **environment**: Environment name (`dev`, `staging`, `prod`)
- **vpc_cidr**: CIDR block for VPC (default: `10.0.0.0/16`)
- **availability_zones**: List of AZs for high availability (minimum 2, recommended 3)
- **opensearch_instance_type**: Instance type for OpenSearch nodes
  - `t3.small.search`: ~$50/month per node (dev/test)
  - `t3.medium.search`: ~$100/month per node (production)
- **opensearch_instance_count**: Number of OpenSearch nodes (1 for dev, 3 for production)
- **redis_node_type**: ElastiCache node type
  - `cache.t3.micro`: ~$12/month (dev/test)
  - `cache.t3.small`: ~$25/month (production)
- **alert_email**: Email address for CloudWatch alarms (optional)

#### 2. OpenSearch Master Password

Set the OpenSearch master user password as an environment variable:

```bash
# Linux/macOS
export TF_VAR_opensearch_master_user_password="YourStrongPassword123!"

# Windows PowerShell
$env:TF_VAR_opensearch_master_user_password="YourStrongPassword123!"

# Windows Command Prompt
set TF_VAR_opensearch_master_user_password=YourStrongPassword123!
```

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character


#### 3. JWT Secret for Authentication

Create a JWT secret in AWS Secrets Manager:

```bash
# Generate a secure random secret
JWT_SECRET=$(openssl rand -base64 32)

# Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name /chatbot/jwt-secret \
  --description "JWT secret for chatbot authentication" \
  --secret-string "$JWT_SECRET" \
  --region us-east-1

# Verify the secret was created
aws secretsmanager describe-secret --secret-id /chatbot/jwt-secret --region us-east-1
```

**Note**: The Terraform configuration expects this secret to exist at `/chatbot/jwt-secret`. If you use a different name, update the `data.aws_secretsmanager_secret_version.jwt_secret` resource in `terraform/main.tf`.

#### 4. Terraform Backend Configuration (Optional)

The project uses an S3 backend for storing Terraform state. The backend is already configured in `terraform/main.tf`:

```hcl
backend "s3" {
  bucket         = "terraform-state-chatbot-177981160483"
  key            = "chatbot/terraform.tfstate"
  region         = "us-east-2"
  encrypt        = true
  dynamodb_table = "terraform-locks-dev"
}
```

**To use your own backend**:

1. Create an S3 bucket for state storage:
```bash
aws s3api create-bucket \
  --bucket terraform-state-chatbot-YOUR-ACCOUNT-ID \
  --region us-east-1 \
  --create-bucket-configuration LocationConstraint=us-east-1

aws s3api put-bucket-versioning \
  --bucket terraform-state-chatbot-YOUR-ACCOUNT-ID \
  --versioning-configuration Status=Enabled
```

2. Create a DynamoDB table for state locking:
```bash
aws dynamodb create-table \
  --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

3. Update the backend configuration in `terraform/main.tf` with your bucket and table names.


## Step-by-Step Deployment

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd aws-claude-rag-chatbot
```

### Step 2: Build Lambda Functions

Before deploying infrastructure, build all Lambda functions:

```bash
cd lambda
chmod +x build.sh
./build.sh
```

This script will:
- Install dependencies for each Lambda function
- Compile TypeScript to JavaScript
- Create deployment packages (ZIP files) in each function's `dist/` directory

**Verify the build**:
```bash
# Check that ZIP files were created
find . -name "index.zip" -type f
```

You should see ZIP files in directories like:
- `lambda/auth/authorizer/dist/index.zip`
- `lambda/auth/login/dist/index.zip`
- `lambda/websocket/connect/dist/index.zip`
- etc.

### Step 3: Configure Terraform Variables

```bash
cd ../terraform

# Create terraform.tfvars from the template
cat > terraform.tfvars <<EOF
aws_region  = "us-east-1"
environment = "dev"

vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

opensearch_instance_type  = "t3.medium.search"
opensearch_instance_count = 3

redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

alert_email = "your-email@example.com"
EOF

# Set OpenSearch password
export TF_VAR_opensearch_master_user_password="YourStrongPassword123!"
```

### Step 4: Initialize Terraform

```bash
terraform init
```

This command will:
- Download the AWS provider plugin
- Initialize the S3 backend
- Prepare all modules

**Expected output**:
```
Initializing modules...
Initializing the backend...
Initializing provider plugins...
Terraform has been successfully initialized!
```


### Step 5: Review the Deployment Plan

```bash
terraform plan -out=tfplan
```

This command creates an execution plan showing:
- Resources to be created (green `+`)
- Resources to be modified (yellow `~`)
- Resources to be destroyed (red `-`)

**Expected resource count**: Approximately 80-100 resources including:
- 1 VPC with 6 subnets (3 public, 3 private)
- 1 NAT Gateway and 1 Internet Gateway
- 3 VPC Endpoints (S3, DynamoDB, Bedrock)
- 1 S3 bucket for documents
- 4 DynamoDB tables
- 1 OpenSearch domain (3 nodes)
- 1 ElastiCache Redis cluster
- 15+ Lambda functions
- 2 API Gateways (REST + WebSocket)
- 1 CloudFront distribution
- Multiple IAM roles and policies
- Multiple security groups
- CloudWatch log groups and alarms

**Review carefully**:
- Check that the region is correct
- Verify subnet CIDR blocks don't conflict with existing networks
- Confirm OpenSearch instance type and count match your requirements
- Review estimated costs (Terraform doesn't show costs, but you can estimate based on instance types)

### Step 6: Apply the Configuration

```bash
terraform apply tfplan
```

**Deployment Timeline**:
- **0-5 minutes**: VPC, subnets, security groups, IAM roles
- **5-10 minutes**: S3 buckets, DynamoDB tables, Lambda functions
- **10-40 minutes**: OpenSearch domain (this is the longest step)
- **40-45 minutes**: API Gateway, CloudFront, final configurations

**Monitor the deployment**:
```bash
# In another terminal, watch CloudFormation events (OpenSearch uses CloudFormation)
aws cloudformation describe-stack-events \
  --stack-name $(aws cloudformation list-stacks --query "StackSummaries[?contains(StackName, 'opensearch')].StackName" --output text) \
  --region us-east-1 \
  --max-items 10
```

**Common warnings you can ignore**:
- "Plan: X to add, 0 to change, 0 to destroy" - This is normal for initial deployment
- Lambda function warnings about VPC configuration - These are informational


### Step 7: Save Deployment Outputs

After successful deployment, save the outputs for later use:

```bash
# Save all outputs to a file
terraform output > outputs.txt

# Display specific outputs
terraform output vpc_id
terraform output opensearch_endpoint
terraform output rest_api_url
terraform output websocket_api_url
terraform output frontend_url
```

**Key outputs you'll need**:

| Output | Description | Used For |
|--------|-------------|----------|
| `vpc_id` | VPC identifier | Lambda VPC configuration |
| `private_subnet_ids` | Private subnet IDs | Lambda VPC configuration |
| `s3_documents_bucket_name` | S3 bucket for documents | Document upload/processing |
| `dynamodb_sessions_table_name` | Sessions table | Authentication |
| `dynamodb_chat_history_table_name` | Chat history table | Chat persistence |
| `dynamodb_rate_limits_table_name` | Rate limits table | Rate limiting |
| `dynamodb_document_metadata_table_name` | Document metadata table | Document tracking |
| `opensearch_endpoint` | OpenSearch endpoint | Vector search |
| `redis_endpoint` | Redis cache endpoint | Response caching |
| `rest_api_url` | REST API URL | Frontend configuration |
| `websocket_api_url` | WebSocket API URL | Frontend configuration |
| `frontend_url` | CloudFront URL | Access the application |

### Step 8: Initialize OpenSearch Index

After OpenSearch is deployed, initialize the vector search index:

```bash
# The vector-store-init Lambda function should be invoked automatically
# Verify it ran successfully
aws lambda invoke \
  --function-name dev-chatbot-vector-store-init \
  --region us-east-1 \
  response.json

cat response.json
```

**Expected response**:
```json
{
  "statusCode": 200,
  "body": "{\"message\":\"Index created successfully\"}"
}
```

If the index wasn't created automatically, you can manually invoke the Lambda function:

```bash
aws lambda invoke \
  --function-name dev-chatbot-vector-store-init \
  --region us-east-1 \
  --payload '{}' \
  response.json
```


### Step 9: Configure Frontend Environment

Update the frontend configuration with the deployed API endpoints:

```bash
cd ../frontend

# Create .env file with API endpoints
cat > .env <<EOF
VITE_REST_API_URL=$(cd ../terraform && terraform output -raw rest_api_url)
VITE_WEBSOCKET_API_URL=$(cd ../terraform && terraform output -raw websocket_api_url)
EOF

# Verify the configuration
cat .env
```

### Step 10: Deploy Frontend Application

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Deploy to S3 (the deploy script syncs to the S3 bucket created by Terraform)
./deploy.sh
```

The frontend is automatically deployed to S3 and served via CloudFront. Access it using the `frontend_url` output from Terraform.

## Post-Deployment Verification

### 1. Verify VPC and Networking

```bash
# Get VPC ID
VPC_ID=$(terraform output -raw vpc_id)

# Check VPC
aws ec2 describe-vpcs --vpc-ids $VPC_ID --region us-east-1

# Check subnets (should show 6: 3 public, 3 private)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --region us-east-1 \
  --query 'Subnets[*].[SubnetId,CidrBlock,AvailabilityZone,MapPublicIpOnLaunch]' \
  --output table

# Check NAT Gateway (should be in "available" state)
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC_ID" --region us-east-1

# Check VPC Endpoints (should show 3: S3, DynamoDB, Bedrock)
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" --region us-east-1 \
  --query 'VpcEndpoints[*].[VpcEndpointId,ServiceName,State]' \
  --output table
```

**Expected results**:
- VPC in "available" state
- 6 subnets (3 with `MapPublicIpOnLaunch: true`, 3 with `false`)
- NAT Gateway in "available" state
- 3 VPC Endpoints in "available" state


### 2. Verify S3 Bucket

```bash
# Get bucket name
BUCKET_NAME=$(terraform output -raw s3_documents_bucket_name)

# Check bucket exists
aws s3 ls s3://$BUCKET_NAME/ --region us-east-1

# Verify encryption
aws s3api get-bucket-encryption --bucket $BUCKET_NAME --region us-east-1

# Verify versioning
aws s3api get-bucket-versioning --bucket $BUCKET_NAME --region us-east-1

# Check folder structure (should show uploads/, processed/, failed/)
aws s3 ls s3://$BUCKET_NAME/ --region us-east-1
```

**Expected results**:
- Bucket exists and is accessible
- Encryption enabled with KMS
- Versioning enabled
- Three folders: `uploads/`, `processed/`, `failed/`

### 3. Verify DynamoDB Tables

```bash
# List all chatbot tables
aws dynamodb list-tables --region us-east-1 \
  --query "TableNames[?contains(@, 'chatbot')]" \
  --output table

# Check Sessions table
aws dynamodb describe-table \
  --table-name $(terraform output -raw dynamodb_sessions_table_name) \
  --region us-east-1 \
  --query 'Table.[TableName,TableStatus,ItemCount,TableSizeBytes]' \
  --output table

# Verify encryption
aws dynamodb describe-table \
  --table-name $(terraform output -raw dynamodb_sessions_table_name) \
  --region us-east-1 \
  --query 'Table.SSEDescription'
```

**Expected results**:
- 4 tables: Sessions, ChatHistory, RateLimits, DocumentMetadata
- All tables in "ACTIVE" status
- Encryption enabled with KMS
- TTL configured on appropriate tables

### 4. Verify OpenSearch Domain

```bash
# Get OpenSearch endpoint
OPENSEARCH_ENDPOINT=$(terraform output -raw opensearch_endpoint)

# Check domain status
aws opensearch describe-domain \
  --domain-name dev-chatbot-opensearch \
  --region us-east-1 \
  --query 'DomainStatus.[DomainName,Processing,UpgradeProcessing,Endpoint]' \
  --output table

# Check cluster health (requires VPN/bastion if in VPC)
# This command will only work if you have network access to the OpenSearch domain
curl -u "master:$TF_VAR_opensearch_master_user_password" \
  "https://$OPENSEARCH_ENDPOINT/_cluster/health?pretty"
```

**Expected results**:
- Domain in "Active" state (not "Processing")
- 3 data nodes
- Endpoint accessible
- Cluster health: "green" or "yellow" (yellow is acceptable for initial state)


### 5. Verify Lambda Functions

```bash
# List all chatbot Lambda functions
aws lambda list-functions --region us-east-1 \
  --query "Functions[?contains(FunctionName, 'chatbot')].[FunctionName,Runtime,State]" \
  --output table

# Test the authorizer function
aws lambda invoke \
  --function-name dev-chatbot-authorizer \
  --region us-east-1 \
  --payload '{"type":"TOKEN","authorizationToken":"test","methodArn":"arn:aws:execute-api:us-east-1:123456789:api-id/dev/GET/test"}' \
  response.json

cat response.json
```

**Expected results**:
- All Lambda functions in "Active" state
- Runtime: `nodejs20.x`
- Functions should include: authorizer, login, logout, connect, disconnect, message, document-upload, document-list, document-delete, chat-history, vector-store-init, document-processor, generate-embeddings

### 6. Verify API Gateway

```bash
# List REST APIs
aws apigateway get-rest-apis --region us-east-1 \
  --query "items[?contains(name, 'chatbot')].[name,id]" \
  --output table

# List WebSocket APIs
aws apigatewayv2 get-apis --region us-east-1 \
  --query "Items[?contains(Name, 'chatbot')].[Name,ApiId,ApiEndpoint]" \
  --output table

# Test REST API health (should return 401 without auth)
REST_API_URL=$(terraform output -raw rest_api_url)
curl -s -o /dev/null -w "%{http_code}" "$REST_API_URL/documents"
```

**Expected results**:
- REST API and WebSocket API both exist
- REST API returns 401 (Unauthorized) for unauthenticated requests
- WebSocket API endpoint is accessible

### 7. Verify CloudWatch Monitoring

```bash
# List log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/chatbot/dev" \
  --region us-east-1 \
  --query "logGroups[*].[logGroupName,retentionInDays]" \
  --output table

# List alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "dev-chatbot" \
  --region us-east-1 \
  --query "MetricAlarms[*].[AlarmName,StateValue]" \
  --output table
```

**Expected results**:
- Log groups with 365-day retention
- Alarms in "OK" or "INSUFFICIENT_DATA" state (normal for new deployment)


### 8. End-to-End Functional Test

Test the complete system flow:

```bash
# 1. Access the frontend
FRONTEND_URL=$(terraform output -raw frontend_url)
echo "Open in browser: $FRONTEND_URL"

# 2. Test login (requires user creation first)
# Create a test user in DynamoDB
aws dynamodb put-item \
  --table-name $(terraform output -raw dynamodb_users_table_name) \
  --item '{
    "userId": {"S": "test-user"},
    "username": {"S": "testuser"},
    "passwordHash": {"S": "$2b$10$..."},
    "roles": {"L": [{"S": "user"}]},
    "createdAt": {"N": "'$(date +%s)'"}
  }' \
  --region us-east-1

# 3. Test document upload via API
# (This requires authentication token from login)

# 4. Check CloudWatch logs for any errors
aws logs tail /aws/lambda/dev-chatbot-message --follow --region us-east-1
```

## Troubleshooting Common Issues

### Issue 1: OpenSearch Domain Creation Timeout

**Symptoms**:
- Terraform times out after 30 minutes
- OpenSearch domain shows "Processing" state

**Causes**:
- OpenSearch domains can take 30-45 minutes to create
- Service-linked role missing
- Subnet configuration issues

**Solutions**:

1. **Check if domain is still creating**:
```bash
aws opensearch describe-domain \
  --domain-name dev-chatbot-opensearch \
  --region us-east-1 \
  --query 'DomainStatus.[DomainName,Processing,Created]'
```

If `Processing: true`, the domain is still being created. Wait and check again.

2. **Verify service-linked role exists**:
```bash
aws iam get-role --role-name AWSServiceRoleForAmazonOpenSearchService
```

If it doesn't exist, create it:
```bash
aws iam create-service-linked-role --aws-service-name es.amazonaws.com
```

3. **Check subnet availability**:
```bash
aws ec2 describe-subnets \
  --subnet-ids $(terraform output -json private_subnet_ids | jq -r '.[]') \
  --region us-east-1 \
  --query 'Subnets[*].[SubnetId,AvailabilityZone,AvailableIpAddressCount]' \
  --output table
```

Ensure subnets have sufficient IP addresses (at least 10 per subnet).

4. **If timeout occurs, re-run apply**:
```bash
terraform apply -auto-approve
```

Terraform will continue from where it left off.


### Issue 2: Lambda Functions Not Connecting to VPC Resources

**Symptoms**:
- Lambda functions timeout when accessing OpenSearch or Redis
- CloudWatch logs show "Task timed out after X seconds"

**Causes**:
- NAT Gateway not configured correctly
- Security groups blocking traffic
- VPC endpoints missing

**Solutions**:

1. **Verify NAT Gateway is running**:
```bash
aws ec2 describe-nat-gateways \
  --filter "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --region us-east-1 \
  --query 'NatGateways[*].[NatGatewayId,State]'
```

State should be "available".

2. **Check Lambda security group rules**:
```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*lambda*" "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --region us-east-1 \
  --query 'SecurityGroups[*].[GroupId,GroupName]'
```

3. **Verify Lambda can reach OpenSearch**:
```bash
# Check OpenSearch security group allows Lambda security group
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*opensearch*" \
  --region us-east-1 \
  --query 'SecurityGroups[*].IpPermissions[*].[FromPort,ToPort,UserIdGroupPairs]'
```

4. **Test Lambda connectivity**:
```bash
# Invoke a Lambda that connects to OpenSearch
aws lambda invoke \
  --function-name dev-chatbot-vector-store-init \
  --region us-east-1 \
  --log-type Tail \
  response.json

# Check logs for connection errors
aws logs tail /aws/lambda/dev-chatbot-vector-store-init --region us-east-1
```

### Issue 3: JWT Secret Not Found

**Symptoms**:
- Terraform fails with "Error reading Secrets Manager secret"
- Authentication Lambda functions fail

**Causes**:
- JWT secret not created in Secrets Manager
- Secret created in wrong region

**Solutions**:

1. **Check if secret exists**:
```bash
aws secretsmanager describe-secret \
  --secret-id /chatbot/jwt-secret \
  --region us-east-1
```

2. **Create the secret if missing**:
```bash
JWT_SECRET=$(openssl rand -base64 32)
aws secretsmanager create-secret \
  --name /chatbot/jwt-secret \
  --description "JWT secret for chatbot authentication" \
  --secret-string "$JWT_SECRET" \
  --region us-east-1
```

3. **Re-run Terraform**:
```bash
terraform apply -auto-approve
```


### Issue 4: DynamoDB Table Already Exists

**Symptoms**:
- Terraform fails with "ResourceInUseException: Table already exists"

**Causes**:
- Previous deployment wasn't fully cleaned up
- Table exists from manual creation

**Solutions**:

1. **Import existing table into Terraform state**:
```bash
terraform import module.database.aws_dynamodb_table.sessions dev-chatbot-sessions
terraform import module.database.aws_dynamodb_table.chat_history dev-chatbot-chat-history
terraform import module.database.aws_dynamodb_table.rate_limits dev-chatbot-rate-limits
terraform import module.database.aws_dynamodb_table.document_metadata dev-chatbot-document-metadata
```

2. **Or delete existing tables** (WARNING: This deletes all data):
```bash
aws dynamodb delete-table --table-name dev-chatbot-sessions --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-chat-history --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-rate-limits --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-document-metadata --region us-east-1

# Wait for deletion to complete
aws dynamodb wait table-not-exists --table-name dev-chatbot-sessions --region us-east-1

# Re-run Terraform
terraform apply -auto-approve
```

### Issue 5: S3 Bucket Name Conflict

**Symptoms**:
- Terraform fails with "BucketAlreadyExists" or "BucketAlreadyOwnedByYou"

**Causes**:
- S3 bucket names must be globally unique
- Bucket exists from previous deployment

**Solutions**:

1. **Check if bucket exists**:
```bash
aws s3 ls s3://chatbot-documents-$(aws sts get-caller-identity --query Account --output text) --region us-east-1
```

2. **Import existing bucket**:
```bash
terraform import module.storage.aws_s3_bucket.documents chatbot-documents-$(aws sts get-caller-identity --query Account --output text)
```

3. **Or use a different bucket name** by modifying `modules/storage/main.tf`:
```hcl
resource "aws_s3_bucket" "documents" {
  bucket = "chatbot-documents-${var.account_id}-${random_string.suffix.result}"
  # ...
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}
```


### Issue 6: IAM Permission Denied Errors

**Symptoms**:
- Terraform fails with "AccessDenied" or "UnauthorizedOperation"
- Specific resource creation fails

**Causes**:
- Insufficient IAM permissions
- Service Control Policies (SCPs) restricting actions
- Region restrictions

**Solutions**:

1. **Verify your IAM permissions**:
```bash
aws sts get-caller-identity
aws iam get-user --user-name YOUR_USERNAME
aws iam list-attached-user-policies --user-name YOUR_USERNAME
```

2. **Check for SCPs** (if using AWS Organizations):
```bash
aws organizations describe-policy --policy-id POLICY_ID
```

3. **Test specific permissions**:
```bash
# Test VPC creation
aws ec2 create-vpc --cidr-block 10.1.0.0/16 --dry-run --region us-east-1

# Test S3 bucket creation
aws s3api create-bucket --bucket test-permissions-$(date +%s) --region us-east-1 --dry-run
```

4. **Request additional permissions** from your AWS administrator or use a role with sufficient permissions.

### Issue 7: WebSocket Connection Failures

**Symptoms**:
- Frontend can't connect to WebSocket API
- WebSocket returns 403 Forbidden

**Causes**:
- CORS configuration incorrect
- Authentication token invalid
- API Gateway not deployed

**Solutions**:

1. **Verify WebSocket API is deployed**:
```bash
aws apigatewayv2 get-stages \
  --api-id $(terraform output -raw websocket_api_id) \
  --region us-east-1
```

2. **Check WebSocket authorizer**:
```bash
aws apigatewayv2 get-authorizers \
  --api-id $(terraform output -raw websocket_api_id) \
  --region us-east-1
```

3. **Test WebSocket connection** using wscat:
```bash
npm install -g wscat

# Get auth token first (from login API)
TOKEN="your-jwt-token"

# Connect to WebSocket
wscat -c "$(terraform output -raw websocket_api_url)?token=$TOKEN"
```

4. **Check CloudWatch logs**:
```bash
aws logs tail /aws/lambda/dev-chatbot-authorizer --follow --region us-east-1
```


### Issue 8: High Costs / Unexpected Charges

**Symptoms**:
- AWS bill higher than expected
- Cost Explorer shows unexpected resource usage

**Causes**:
- NAT Gateway data transfer charges
- OpenSearch instance running 24/7
- CloudWatch Logs storage
- Unused resources not cleaned up

**Solutions**:

1. **Review current costs**:
```bash
# Get cost breakdown for last 7 days
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --region us-east-1
```

2. **Optimize OpenSearch for dev environments**:
```hcl
# In terraform.tfvars
opensearch_instance_type  = "t3.small.search"  # Instead of t3.medium.search
opensearch_instance_count = 1                   # Instead of 3
```

3. **Reduce Redis costs**:
```hcl
# In terraform.tfvars
redis_node_type = "cache.t3.micro"  # Smallest instance
redis_num_cache_nodes = 1           # Single node
```

4. **Enable S3 Intelligent-Tiering** (already configured):
```bash
aws s3api get-bucket-intelligent-tiering-configuration \
  --bucket $(terraform output -raw s3_documents_bucket_name) \
  --id EntireS3Bucket \
  --region us-east-1
```

5. **Set CloudWatch Logs retention** (already configured to 365 days):
```bash
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/chatbot" \
  --region us-east-1 \
  --query "logGroups[*].[logGroupName,retentionInDays]"
```

6. **Stop/destroy resources when not in use**:
```bash
# For dev environments, destroy when not needed
terraform destroy -auto-approve

# Or stop specific resources
aws opensearch update-domain-config \
  --domain-name dev-chatbot-opensearch \
  --cluster-config InstanceCount=1 \
  --region us-east-1
```


## Cost Optimization

### Monthly Cost Breakdown (us-east-1)

| Service | Configuration | Monthly Cost | Optimization Options |
|---------|--------------|--------------|---------------------|
| **OpenSearch** | 3x t3.medium.search (24/7) | ~$300 | Use t3.small.search (~$150) or 1 node for dev (~$50) |
| **NAT Gateway** | 1x NAT + data transfer (100GB) | ~$35 | Use VPC endpoints to reduce data transfer |
| **ElastiCache Redis** | 1x cache.t3.micro | ~$12 | Already minimal, can disable for dev |
| **Lambda** | 1M requests, 512MB, 2s avg | ~$20 | Use provisioned concurrency sparingly |
| **DynamoDB** | On-demand, 10M reads, 5M writes | ~$15 | Already optimized with on-demand |
| **S3** | 100GB storage + requests | ~$3 | Use Intelligent-Tiering (configured) |
| **CloudWatch** | 10GB logs, 100 metrics | ~$10 | Reduce log retention for dev |
| **API Gateway** | 1M WebSocket messages | ~$5 | Already minimal |
| **CloudFront** | 100GB data transfer | ~$10 | Already minimal |
| **KMS** | 1 key, 10K requests | ~$1 | Already minimal |
| **VPC Endpoints** | 3 endpoints | ~$22 | Required for security |
| **Data Transfer** | Inter-AZ, outbound | ~$15 | Use single AZ for dev |
| **Total** | | **~$448/month** | **~$150/month (optimized dev)** |

### Cost Optimization Strategies

#### 1. Development Environment Optimization

```hcl
# terraform.tfvars for dev environment
environment = "dev"

# Use smaller instances
opensearch_instance_type  = "t3.small.search"
opensearch_instance_count = 1

# Single AZ deployment
availability_zones   = ["us-east-1a"]
private_subnet_cidrs = ["10.0.1.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24"]

# Minimal Redis
redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# Disable Redis backups
redis_snapshot_retention_limit = 0
```

**Savings**: ~$300/month (from $448 to ~$150)

#### 2. Use Scheduled Scaling

For non-production environments, stop resources during off-hours:

```bash
# Create EventBridge rules to stop/start OpenSearch
aws events put-rule \
  --name stop-opensearch-evening \
  --schedule-expression "cron(0 20 * * ? *)" \
  --region us-east-1

# Note: OpenSearch doesn't support stop/start, but you can reduce instance count
```

#### 3. Enable S3 Lifecycle Policies

```bash
# Move old documents to cheaper storage classes
aws s3api put-bucket-lifecycle-configuration \
  --bucket $(terraform output -raw s3_documents_bucket_name) \
  --lifecycle-configuration file://lifecycle.json \
  --region us-east-1
```

`lifecycle.json`:
```json
{
  "Rules": [
    {
      "Id": "MoveToIA",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```


#### 4. Monitor and Set Budgets

```bash
# Create a budget alert
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json

# budget.json
{
  "BudgetName": "chatbot-monthly-budget",
  "BudgetLimit": {
    "Amount": "200",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}

# notifications.json
{
  "Notification": {
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80,
    "ThresholdType": "PERCENTAGE"
  },
  "Subscribers": [
    {
      "SubscriptionType": "EMAIL",
      "Address": "your-email@example.com"
    }
  ]
}
```

#### 5. Use AWS Cost Explorer

```bash
# Enable Cost Explorer (one-time)
aws ce enable-cost-explorer

# Get cost recommendations
aws ce get-rightsizing-recommendation \
  --service "Amazon OpenSearch Service" \
  --region us-east-1
```

## Security Best Practices

### 1. Enable MFA for AWS Account

```bash
# Check if MFA is enabled
aws iam get-user --user-name YOUR_USERNAME \
  --query 'User.MfaDevices'
```

### 2. Rotate JWT Secret Regularly

```bash
# Generate new secret
NEW_JWT_SECRET=$(openssl rand -base64 32)

# Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id /chatbot/jwt-secret \
  --secret-string "$NEW_JWT_SECRET" \
  --region us-east-1

# Redeploy Lambda functions to pick up new secret
terraform apply -target=module.auth -auto-approve
```

### 3. Enable CloudTrail Logging

```bash
# Create CloudTrail for audit logging
aws cloudtrail create-trail \
  --name chatbot-audit-trail \
  --s3-bucket-name chatbot-cloudtrail-logs-$(aws sts get-caller-identity --query Account --output text) \
  --is-multi-region-trail \
  --region us-east-1

# Start logging
aws cloudtrail start-logging --name chatbot-audit-trail --region us-east-1
```

### 4. Review IAM Policies Regularly

```bash
# List all IAM roles created by Terraform
aws iam list-roles \
  --query "Roles[?contains(RoleName, 'chatbot')].[RoleName,CreateDate]" \
  --output table

# Review a specific role's policies
aws iam list-attached-role-policies \
  --role-name dev-chatbot-lambda-execution-role
```


### 5. Enable VPC Flow Logs

```bash
# Create CloudWatch log group for VPC flow logs
aws logs create-log-group \
  --log-group-name /aws/vpc/flowlogs \
  --region us-east-1

# Enable VPC flow logs
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids $(terraform output -raw vpc_id) \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /aws/vpc/flowlogs \
  --deliver-logs-permission-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/flowlogsRole \
  --region us-east-1
```

### 6. Implement Least Privilege Access

Review and tighten IAM policies:

```bash
# Use IAM Access Analyzer to identify unused permissions
aws accessanalyzer create-analyzer \
  --analyzer-name chatbot-analyzer \
  --type ACCOUNT \
  --region us-east-1

# Get findings
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:$(aws sts get-caller-identity --query Account --output text):analyzer/chatbot-analyzer \
  --region us-east-1
```

### 7. Enable AWS GuardDuty

```bash
# Enable GuardDuty for threat detection
aws guardduty create-detector \
  --enable \
  --region us-east-1

# Get detector ID
DETECTOR_ID=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text --region us-east-1)

# Check findings
aws guardduty list-findings \
  --detector-id $DETECTOR_ID \
  --region us-east-1
```

## Cleanup and Teardown

### Before Destroying Resources

1. **Export important data**:
```bash
# Export DynamoDB tables
aws dynamodb scan \
  --table-name $(terraform output -raw dynamodb_chat_history_table_name) \
  --region us-east-1 > chat_history_backup.json

# Download S3 documents
aws s3 sync \
  s3://$(terraform output -raw s3_documents_bucket_name)/ \
  ./documents_backup/ \
  --region us-east-1
```

2. **Verify no active users**:
```bash
# Check active sessions
aws dynamodb scan \
  --table-name $(terraform output -raw dynamodb_sessions_table_name) \
  --region us-east-1 \
  --query 'Count'
```

3. **Notify stakeholders** that the system will be taken down.


### Destroy Infrastructure

```bash
cd terraform

# Review what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy
```

**Destruction order** (Terraform handles this automatically):
1. CloudFront distribution (can take 15-20 minutes)
2. API Gateway APIs
3. Lambda functions
4. OpenSearch domain (can take 10-15 minutes)
5. ElastiCache cluster
6. DynamoDB tables
7. S3 buckets (must be empty first)
8. VPC endpoints
9. NAT Gateway
10. Internet Gateway
11. Subnets and route tables
12. VPC
13. IAM roles and policies
14. KMS keys (scheduled for deletion)
15. CloudWatch log groups

**Expected duration**: 30-45 minutes

### Manual Cleanup (if needed)

If `terraform destroy` fails, manually delete resources:

```bash
# 1. Empty and delete S3 buckets
aws s3 rm s3://$(terraform output -raw s3_documents_bucket_name) --recursive --region us-east-1
aws s3 rb s3://$(terraform output -raw s3_documents_bucket_name) --region us-east-1

# 2. Delete OpenSearch domain
aws opensearch delete-domain \
  --domain-name dev-chatbot-opensearch \
  --region us-east-1

# 3. Delete DynamoDB tables
aws dynamodb delete-table --table-name dev-chatbot-sessions --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-chat-history --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-rate-limits --region us-east-1
aws dynamodb delete-table --table-name dev-chatbot-document-metadata --region us-east-1

# 4. Delete Lambda functions
aws lambda list-functions --region us-east-1 \
  --query "Functions[?contains(FunctionName, 'chatbot')].FunctionName" \
  --output text | xargs -n1 aws lambda delete-function --function-name --region us-east-1

# 5. Delete VPC (this will fail if resources still exist)
aws ec2 delete-vpc --vpc-id $(terraform output -raw vpc_id) --region us-east-1

# 6. Re-run terraform destroy
terraform destroy -auto-approve
```

### Verify Cleanup

```bash
# Check for remaining resources
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=AWS-Claude-RAG-Chatbot \
  --region us-east-1

# Check CloudWatch log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/chatbot" \
  --region us-east-1

# Check S3 buckets
aws s3 ls | grep chatbot
```

### Cost After Deletion

Some resources may incur minimal costs after deletion:

- **KMS keys**: $1/month until deletion (30-day waiting period)
- **CloudWatch Logs**: Storage costs until logs expire
- **S3 Glacier**: If documents were archived, retrieval costs apply

To completely eliminate costs:

```bash
# Delete CloudWatch log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/chatbot" \
  --region us-east-1 \
  --query 'logGroups[*].logGroupName' \
  --output text | xargs -n1 aws logs delete-log-group --log-group-name --region us-east-1

# Schedule KMS key deletion (minimum 7 days)
aws kms schedule-key-deletion \
  --key-id $(terraform output -raw kms_key_id) \
  --pending-window-in-days 7 \
  --region us-east-1
```


## Additional Resources

### Documentation Links

- **Terraform AWS Provider**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **AWS OpenSearch Service**: https://docs.aws.amazon.com/opensearch-service/
- **AWS Lambda**: https://docs.aws.amazon.com/lambda/
- **Amazon Bedrock**: https://docs.aws.amazon.com/bedrock/
- **API Gateway**: https://docs.aws.amazon.com/apigateway/
- **DynamoDB**: https://docs.aws.amazon.com/dynamodb/

### Useful Commands Reference

```bash
# Terraform
terraform init              # Initialize Terraform
terraform plan              # Preview changes
terraform apply             # Apply changes
terraform destroy           # Destroy all resources
terraform output            # Show outputs
terraform state list        # List resources in state
terraform state show <resource>  # Show resource details
terraform refresh           # Refresh state from AWS
terraform validate          # Validate configuration

# AWS CLI
aws configure               # Configure credentials
aws sts get-caller-identity # Check current identity
aws s3 ls                   # List S3 buckets
aws dynamodb list-tables    # List DynamoDB tables
aws lambda list-functions   # List Lambda functions
aws logs tail <log-group>   # Tail CloudWatch logs
aws cloudwatch describe-alarms  # List CloudWatch alarms

# Debugging
terraform apply -debug      # Enable debug logging
export TF_LOG=DEBUG         # Enable Terraform debug logs
aws --debug <command>       # Enable AWS CLI debug output
```

### Support and Troubleshooting

1. **Check CloudWatch Logs** for Lambda function errors
2. **Review Terraform state**: `terraform show`
3. **Validate configuration**: `terraform validate`
4. **Check AWS Service Health**: https://status.aws.amazon.com/
5. **AWS Support**: https://console.aws.amazon.com/support/

### Next Steps After Deployment

1. **Configure User Management**: Create users in DynamoDB or integrate with Cognito
2. **Upload Test Documents**: Test the document processing pipeline
3. **Configure Monitoring Alerts**: Set up SNS notifications for critical alarms
4. **Implement Backup Strategy**: Configure automated backups for DynamoDB and S3
5. **Set Up CI/CD**: Automate deployments using GitHub Actions or AWS CodePipeline
6. **Performance Testing**: Load test the system to validate scaling behavior
7. **Security Audit**: Run AWS Security Hub and review findings

## Summary

This guide covered the complete deployment process for the AWS Claude RAG Chatbot infrastructure:

✅ **Prerequisites**: Installed Terraform, AWS CLI, Node.js, and configured AWS credentials
✅ **Configuration**: Set up terraform.tfvars, OpenSearch password, and JWT secret
✅ **Deployment**: Deployed 80+ AWS resources using Terraform
✅ **Verification**: Validated all components are working correctly
✅ **Troubleshooting**: Addressed common deployment issues
✅ **Cost Optimization**: Implemented strategies to reduce monthly costs
✅ **Security**: Applied best practices for production deployments
✅ **Cleanup**: Documented proper teardown procedures

**Deployment Time**: ~45 minutes
**Monthly Cost**: $150-$450 (depending on configuration)
**Resources Created**: ~80-100 AWS resources

For questions or issues, refer to the troubleshooting section or check CloudWatch logs for detailed error messages.

---

**Document Version**: 1.0
**Last Updated**: 2024
**Validates Requirement**: 13.1 (Infrastructure as Code Deployment)
