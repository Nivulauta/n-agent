# Nivulauta Agent - Terraform Infrastructure

This directory contains Terraform configurations for deploying the Nivulauta Agent infrastructure.

## Architecture Overview

The infrastructure includes:

- **Networking**: VPC with public/private subnets, NAT Gateway, VPC endpoints for S3, DynamoDB, and Bedrock
- **Storage**: S3 bucket with KMS encryption, versioning, and folder structure (uploads/, processed/, failed/)
- **Database**: DynamoDB tables for Sessions, ChatHistory, RateLimits, and DocumentMetadata
- **Search**: OpenSearch cluster (3-node t3.medium.search) with k-NN plugin for vector search
- **Security**: IAM roles with least privilege, security groups, KMS encryption keys
- **Monitoring**: CloudWatch log groups with 365-day retention and metric alarms

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.0 installed
3. AWS account with permissions to create the required resources

## Configuration

1. Copy the example variables file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` with your specific values:
   - `aws_region`: AWS region for deployment (default: us-east-1)
   - `environment`: Environment name (dev, staging, prod)
   - `opensearch_master_user_password`: Strong password for OpenSearch master user

## Deployment

1. Initialize Terraform:
   ```bash
   terraform init
   ```

2. Review the planned changes:
   ```bash
   terraform plan
   ```

3. Apply the configuration:
   ```bash
   terraform apply
   ```

4. Note the outputs - you'll need these for Lambda function configuration:
   - VPC and subnet IDs
   - S3 bucket name
   - DynamoDB table names
   - OpenSearch endpoint
   - IAM role ARNs

## Module Structure

```
terraform/
├── main.tf                    # Root module configuration
├── variables.tf               # Input variables
├── outputs.tf                 # Output values
├── modules/
│   ├── networking/           # VPC, subnets, NAT, VPC endpoints
│   ├── storage/              # S3 buckets with encryption
│   ├── database/             # DynamoDB tables
│   ├── opensearch/           # OpenSearch cluster
│   ├── security/             # IAM roles, security groups, KMS
│   └── monitoring/           # CloudWatch logs and alarms
```

## Security Features

- **Encryption at Rest**: All data encrypted using KMS customer-managed keys
- **Encryption in Transit**: TLS 1.2+ enforced for all connections
- **Network Isolation**: Private subnets for OpenSearch and Lambda functions
- **Least Privilege IAM**: Separate roles for each service with minimal permissions
- **Audit Logging**: 365-day retention for all audit logs

## Cost Optimization

- DynamoDB on-demand pricing for variable workloads
- S3 Intelligent-Tiering for older documents
- OpenSearch t3.medium.search instances (can be adjusted)
- VPC endpoints to avoid NAT Gateway data transfer costs

## Cleanup

To destroy all resources:
```bash
terraform destroy
```

**Warning**: This will delete all data including S3 buckets, DynamoDB tables, and OpenSearch indices.

## Next Steps

After infrastructure deployment:

1. Deploy Lambda functions (Task 2)
2. Configure API Gateway (Task 3)
3. Set up document processing pipeline (Task 4)
4. Deploy frontend application (Task 5)

## Troubleshooting

### OpenSearch Domain Creation Timeout

OpenSearch domains can take 15-30 minutes to create. If you encounter timeouts, the domain may still be creating in the background. Check the AWS Console.

### VPC Endpoint Issues

Ensure your VPC has DNS resolution and DNS hostnames enabled. These are required for VPC endpoints to work properly.

### IAM Permission Errors

Verify your AWS credentials have permissions to create IAM roles, KMS keys, and VPC resources.

## Requirements Validated

This infrastructure satisfies the following requirements:

- **13.1**: Terraform configurations for all AWS resources
- **13.2**: Lambda function IAM roles defined (ready for Lambda deployment)
- **13.3**: IAM roles with least privilege permissions
- **13.4**: OpenSearch cluster with appropriate instance types (t3.medium.search)
- **4.4**: S3 encryption at rest using AWS KMS
- **4.5**: S3 encryption in transit using TLS 1.2+
- **8.5**: DynamoDB encryption using KMS (AES-256)
