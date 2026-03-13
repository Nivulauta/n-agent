# Troubleshooting Integration Tests

## Common Issues and Solutions

### 1. Access Denied Error (S3 PutObject)

**Error:**
```
botocore.errorfactory.AccessDenied: An error occurred (AccessDenied) when calling the PutObject operation: Access Denied
```

**Cause:** Your AWS IAM user/role doesn't have permission to write to the S3 bucket.

**Solution:**

#### Option A: Run the Setup Script (Recommended)

The setup script will verify your permissions and guide you:

```bash
# For Linux/Mac
bash setup_test_env.sh

# For Windows PowerShell
.\setup_test_env.ps1
```

#### Option B: Add IAM Permissions Manually

Add the following IAM policy to your user/role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::dev-chatbot-documents-177981160483"
    },
    {
      "Sid": "S3ObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::dev-chatbot-documents-177981160483/*"
    },
    {
      "Sid": "LambdaInvoke",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:dev-chatbot-*"
      ]
    },
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/dev-chatbot-*"
      ]
    }
  ]
}
```

**To add this policy:**

1. Go to AWS IAM Console
2. Find your user/role
3. Click "Add permissions" → "Create inline policy"
4. Paste the JSON above (update bucket name and account ID)
5. Name it "ChatbotIntegrationTestAccess"
6. Click "Create policy"

#### Option C: Use AWS CLI to Add Permissions

```bash
# Get your current user ARN
aws sts get-caller-identity

# Create policy file
cat > test-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::dev-chatbot-documents-177981160483",
        "arn:aws:s3:::dev-chatbot-documents-177981160483/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": ["arn:aws:lambda:*:*:function:dev-chatbot-*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": ["arn:aws:dynamodb:*:*:table/dev-chatbot-*"]
    }
  ]
}
EOF

# Attach policy to your user (replace YOUR_USERNAME)
aws iam put-user-policy \
  --user-name YOUR_USERNAME \
  --policy-name ChatbotTestAccess \
  --policy-document file://test-policy.json
```

### 2. Wrong Bucket Name

**Error:**
```
ValueError: TEST_BUCKET_NAME environment variable is required
```

**Solution:**

The bucket name must match what Terraform created. Run:

```bash
cd ../../../../terraform
terraform output s3_documents_bucket_name
```

Then set the environment variable:

```bash
export TEST_BUCKET_NAME="dev-chatbot-documents-177981160483"
```

Or use the setup script which does this automatically.

### 3. AWS Credentials Not Configured

**Error:**
```
botocore.exceptions.NoCredentialsError: Unable to locate credentials
```

**Solution:**

Configure AWS credentials:

```bash
# Option 1: AWS CLI configure
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-2"

# Option 3: AWS Profile
export AWS_PROFILE="your-profile-name"
```

### 4. Lambda Function Not Found

**Error:**
```
botocore.errorfactory.ResourceNotFoundException: Function not found
```

**Solution:**

Verify Lambda functions exist:

```bash
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `dev-chatbot`)].FunctionName'
```

Update environment variables with correct function names:

```bash
export EXTRACT_TEXT_LAMBDA="dev-chatbot-extract-text"
export EMBEDDING_GENERATOR_LAMBDA="dev-chatbot-generate-embeddings"
```

### 5. DynamoDB Table Not Found

**Error:**
```
botocore.errorfactory.ResourceNotFoundException: Requested resource not found
```

**Solution:**

Verify DynamoDB table exists:

```bash
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `dev-chatbot`)]'
```

Update environment variable:

```bash
export DOCUMENT_METADATA_TABLE="dev-chatbot-document-metadata"
```

### 6. Tests Timeout

**Error:**
```
TimeoutError: Document processing did not complete within 90 seconds
```

**Possible Causes:**
- Lambda function has errors (check CloudWatch Logs)
- Lambda doesn't have permissions to invoke other Lambdas
- OpenSearch cluster is not accessible from Lambda VPC
- S3 event notification not configured

**Solution:**

Check Lambda logs:

```bash
# Get recent logs for extract-text Lambda
aws logs tail /aws/lambda/dev-chatbot-extract-text --follow

# Get recent logs for embedding generator Lambda
aws logs tail /aws/lambda/dev-chatbot-embedding-generator --follow
```

Verify Lambda can invoke other Lambdas:

```bash
aws lambda get-policy --function-name dev-chatbot-extract-text
```

### 7. Python Dependencies Missing

**Error:**
```
ModuleNotFoundError: No module named 'boto3'
```

**Solution:**

Install test dependencies:

```bash
pip install -r requirements.txt
```

Or use the run script which installs dependencies automatically:

```bash
bash run_tests.sh
```

## Quick Start Checklist

Before running tests, ensure:

- [ ] AWS credentials are configured (`aws sts get-caller-identity` works)
- [ ] Infrastructure is deployed (`terraform apply` completed)
- [ ] IAM permissions are granted (see Option B above)
- [ ] Environment variables are set (run `setup_test_env.sh`)
- [ ] Python dependencies are installed (`pip install -r requirements.txt`)

## Getting Help

If you're still having issues:

1. Run the setup script with verbose output:
   ```bash
   bash -x setup_test_env.sh
   ```

2. Check AWS CloudWatch Logs for Lambda errors

3. Verify your IAM permissions:
   ```bash
   aws iam get-user-policy --user-name YOUR_USERNAME --policy-name ChatbotTestAccess
   ```

4. Test S3 access manually:
   ```bash
   echo "test" > test.txt
   aws s3 cp test.txt s3://dev-chatbot-documents-177981160483/uploads/test/test.txt
   aws s3 rm s3://dev-chatbot-documents-177981160483/uploads/test/test.txt
   rm test.txt
   ```
