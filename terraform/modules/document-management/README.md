# Document Management Module

This Terraform module manages the Lambda functions for document operations in the Nivulauta Agent system.

## Overview

The module provisions three Lambda functions for document management:
- **Upload Handler** - Generates presigned URLs for document uploads
- **List Handler** - Retrieves list of documents for a user
- **Delete Handler** - Deletes documents and associated resources

## Lambda Functions

### Upload Lambda
- **Function**: `${environment}-document-upload`
- **Handler**: `index.handler`
- **Runtime**: Node.js 22.x
- **Memory**: 512 MB
- **Timeout**: 30 seconds
- **Permissions**: DynamoDB PutItem, S3 PutObject, KMS Decrypt/GenerateDataKey

### List Lambda
- **Function**: `${environment}-document-list`
- **Handler**: `index.handler`
- **Runtime**: Node.js 22.x
- **Memory**: 512 MB
- **Timeout**: 30 seconds
- **Permissions**: DynamoDB Query, KMS Decrypt

### Delete Lambda
- **Function**: `${environment}-document-delete`
- **Handler**: `index.handler`
- **Runtime**: Node.js 22.x
- **Memory**: 512 MB
- **Timeout**: 30 seconds
- **VPC**: Attached to private subnets for OpenSearch access
- **Permissions**: 
  - DynamoDB GetItem, DeleteItem
  - S3 ListBucket, DeleteObject
  - OpenSearch ESHttpDelete
  - KMS Decrypt
  - VPC network interfaces (via AWSLambdaVPCAccessExecutionRole)

## Resources Created

### IAM Roles
- `${environment}-document-upload-lambda-role`
- `${environment}-document-list-lambda-role`
- `${environment}-document-delete-lambda-role`

### IAM Policies
- Upload policy: DynamoDB, S3, KMS permissions
- List policy: DynamoDB Query, KMS permissions
- Delete policy: DynamoDB, S3, OpenSearch, KMS permissions

### Lambda Functions
- Upload function with environment variables
- List function with environment variables
- Delete function with VPC configuration and environment variables

### CloudWatch Log Groups
- `/aws/lambda/${environment}-document-upload` (365-day retention)
- `/aws/lambda/${environment}-document-list` (365-day retention)
- `/aws/lambda/${environment}-document-delete` (365-day retention)

## Inputs

| Name | Description | Type | Required |
|------|-------------|------|----------|
| environment | Environment name (e.g., dev, staging, prod) | string | yes |
| document_metadata_table_name | Name of the DocumentMetadata DynamoDB table | string | yes |
| document_metadata_table_arn | ARN of the DocumentMetadata DynamoDB table | string | yes |
| documents_bucket_name | Name of the S3 bucket for documents | string | yes |
| documents_bucket_arn | ARN of the S3 bucket for documents | string | yes |
| kms_key_arn | ARN of the KMS key for encryption | string | yes |
| opensearch_endpoint | OpenSearch domain endpoint (without https://) | string | yes |
| opensearch_index | OpenSearch index name for documents | string | no (default: "documents") |
| opensearch_domain_arn | ARN of the OpenSearch domain | string | yes |
| private_subnet_ids | List of private subnet IDs for Lambda VPC configuration | list(string) | yes |
| lambda_security_group_id | Security group ID for Lambda functions to access OpenSearch | string | yes |

## Outputs

| Name | Description |
|------|-------------|
| upload_function_name | Name of the Upload Lambda function |
| upload_function_arn | ARN of the Upload Lambda function |
| upload_invoke_arn | Invoke ARN of the Upload Lambda function |
| list_function_name | Name of the List Lambda function |
| list_function_arn | ARN of the List Lambda function |
| list_invoke_arn | Invoke ARN of the List Lambda function |
| delete_function_name | Name of the Delete Lambda function |
| delete_function_arn | ARN of the Delete Lambda function |
| delete_invoke_arn | Invoke ARN of the Delete Lambda function |

## Usage

```hcl
module "document_management" {
  source = "./modules/document-management"

  environment                  = "dev"
  document_metadata_table_name = "DocumentMetadata"
  document_metadata_table_arn  = "arn:aws:dynamodb:us-east-1:123456789012:table/DocumentMetadata"
  documents_bucket_name        = "my-documents-bucket"
  documents_bucket_arn         = "arn:aws:s3:::my-documents-bucket"
  kms_key_arn                  = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  opensearch_endpoint          = "vpc-my-domain-abc123.us-east-1.es.amazonaws.com"
  opensearch_index             = "documents"
  opensearch_domain_arn        = "arn:aws:es:us-east-1:123456789012:domain/my-domain"
  private_subnet_ids           = ["subnet-12345678", "subnet-87654321"]
  lambda_security_group_id     = "sg-12345678"
}
```

## API Gateway Integration

The Lambda functions are designed to be integrated with API Gateway:

- **POST /documents/upload** → Upload Lambda
- **GET /documents** → List Lambda
- **DELETE /documents/{documentId}** → Delete Lambda

All endpoints require authentication via Lambda Authorizer.

## VPC Configuration

The Delete Lambda function is attached to VPC private subnets to access OpenSearch. Ensure:
- Private subnets have NAT Gateway for outbound internet access (Bedrock API calls)
- Security group allows Lambda → OpenSearch communication on port 443
- VPC endpoints configured for S3 and DynamoDB (optional, for cost optimization)

## Security

- All Lambda functions use least privilege IAM policies
- CloudWatch Logs enabled for audit trail (365-day retention)
- KMS encryption for data at rest
- VPC isolation for OpenSearch access
- Session token validation via Lambda Authorizer

## Dependencies

The module depends on:
- Networking module (VPC, subnets)
- Security module (KMS key, security groups)
- Storage module (S3 bucket)
- Database module (DynamoDB tables)
- OpenSearch module (domain endpoint and ARN)

## Notes

- Lambda source code must be built before applying Terraform (run `npm run build` in each Lambda directory)
- The Delete Lambda requires VPC configuration, which may increase cold start times
- Consider using provisioned concurrency for latency-sensitive workloads
- CloudWatch Logs retention is set to 365 days for compliance requirements
