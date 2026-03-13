# Generate Embeddings Lambda - Deployment Guide

## Prerequisites

1. Node.js 20.x or later
2. npm
3. AWS CLI configured with appropriate credentials
4. Terraform (if deploying infrastructure)

## Build Steps

### 1. Build the shared embeddings module

```bash
cd ../../../shared/embeddings
npm install
npm run build
```

### 2. Build the Lambda function

```bash
cd ../../document-processor/generate-embeddings
npm install
npm run build
```

### 3. Package for deployment

The build script will create a `dist/` directory with the compiled code.

## Deployment Options

### Option 1: Terraform (Recommended)

The Generate Embeddings Lambda is now integrated into the `terraform/modules/document-processor` module.

1. Navigate to your Terraform configuration directory
2. The document-processor module automatically includes the Generate Embeddings Lambda:

```hcl
module "document_processor" {
  source = "./modules/document-processor"
  
  environment                     = var.environment
  aws_region                      = var.aws_region
  documents_bucket_name           = module.storage.documents_bucket_name
  documents_bucket_arn            = module.storage.documents_bucket_arn
  document_metadata_table_name    = module.database.document_metadata_table_name
  document_metadata_table_arn     = module.database.document_metadata_table_arn
  kms_key_arn                     = module.security.kms_key_arn
  failed_processing_sns_topic_arn = module.notifications.failed_processing_topic_arn
}
```

3. The module will automatically:
   - Deploy the Generate Embeddings Lambda
   - Configure the Document Processor to invoke it
   - Set up IAM permissions for the integration

4. Apply Terraform:

```bash
terraform plan
terraform apply
```

### What the Module Creates

The document-processor module now creates:
- Document Processor Lambda (Python) for text extraction and chunking
- Generate Embeddings Lambda (TypeScript) for embedding generation
- IAM roles and policies for both functions
- Lambda layer for Python dependencies
- S3 event notification for document uploads
- Integration between Document Processor and Generate Embeddings

### Option 2: AWS CLI

1. Create a deployment package:

```bash
cd dist
zip -r ../generate-embeddings.zip .
cd ..
```

2. Create the Lambda function:

```bash
aws lambda create-function \
  --function-name dev-generate-embeddings \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://generate-embeddings.zip \
  --timeout 300 \
  --memory-size 1024 \
  --environment Variables="{AWS_REGION=us-east-1}"
```

3. Update the Document Processor environment variable:

```bash
aws lambda update-function-configuration \
  --function-name dev-document-processor \
  --environment Variables="{EMBEDDING_GENERATOR_LAMBDA=dev-generate-embeddings,...}"
```

## Testing

### Test the Lambda function directly

```bash
aws lambda invoke \
  --function-name dev-generate-embeddings \
  --payload '{"bucket":"your-bucket","documentId":"test-doc-id","chunksKey":"processed/test-doc-id/chunks.json"}' \
  response.json

cat response.json
```

### Test the integration

1. Upload a PDF to the S3 uploads/ folder
2. Check CloudWatch Logs for the Document Processor
3. Verify the Embedding Generator was invoked
4. Check the response in CloudWatch Logs

## Monitoring

### CloudWatch Logs

- Log Group: `/aws/lambda/dev-generate-embeddings`
- Retention: 365 days

### Key Metrics

- Invocations
- Duration
- Errors
- Throttles

### Alarms (Recommended)

```hcl
resource "aws_cloudwatch_metric_alarm" "embedding_generator_errors" {
  alarm_name          = "${var.environment}-embedding-generator-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Embedding Generator Lambda errors"
  
  dimensions = {
    FunctionName = module.generate_embeddings_lambda.lambda_function_name
  }
}
```

## Troubleshooting

### Lambda timeout

If processing large documents with many chunks:
- Increase Lambda timeout (max 900 seconds)
- Increase memory allocation (more memory = more CPU)

### Bedrock throttling

If hitting Bedrock rate limits:
- Reduce batch size in the code
- Add exponential backoff (already implemented)
- Request quota increase from AWS

### Missing embeddings module

Ensure the shared embeddings module is built and copied to dist/:

```bash
cd ../../../shared/embeddings
npm run build
cd ../../document-processor/generate-embeddings
./build.sh
```

## Next Steps

After deployment, proceed to Task 11.2 to wire the Embedding Generator to the Vector Store for indexing.
