# Quick Start Guide - Integration Tests

## Fix "Access Denied" Error in 3 Steps

### Step 1: Run the Setup Script

This will automatically configure your environment with the correct bucket name and settings:

**Linux/Mac:**
```bash
cd lambda/document-processor/tests/integration
bash setup_test_env.sh
```

**Windows PowerShell:**
```powershell
cd lambda\document-processor\tests\integration
.\setup_test_env.ps1
```

The script will:
- Extract the correct S3 bucket name from Terraform
- Create a `.env` file with all configuration
- Verify your AWS credentials
- Check if you have S3 access

### Step 2: Add IAM Permissions (if needed)

If the setup script reports "Access Denied", you need to add IAM permissions.

**Quick Method - AWS Console:**

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → Find your username
3. Click "Add permissions" → "Create inline policy"
4. Click "JSON" tab and paste:

```json
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
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:*:*:function:dev-chatbot-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/dev-chatbot-*"
    }
  ]
}
```

5. Name it "ChatbotIntegrationTestAccess"
6. Click "Create policy"

**Note:** Replace `dev-chatbot-documents-177981160483` with your actual bucket name from Step 1.

### Step 3: Run the Tests

**Option A: Use the test runner script (recommended)**

```bash
# Linux/Mac
bash run_tests.sh

# Windows PowerShell
.\run_tests.ps1
```

**Option B: Run tests directly**

```bash
# Load environment variables first
source .env  # Linux/Mac

# Or for PowerShell
Get-Content .env | ForEach-Object { $name, $value = $_.Split('=', 2); [Environment]::SetEnvironmentVariable($name, $value, "Process") }

# Then run tests
python -m unittest test_pipeline.py -v
```

## Verify S3 Access Before Running Tests

To quickly check if you have the right permissions:

```bash
python test_s3_access.py
```

This will test all required S3 operations and tell you exactly what's missing.

## Common Issues

### "TEST_BUCKET_NAME environment variable is required"

**Solution:** Run `setup_test_env.sh` to create the `.env` file.

### "Access Denied" when running tests

**Solution:** Add IAM permissions (see Step 2 above).

### "Bucket does not exist"

**Solution:** Make sure infrastructure is deployed:
```bash
cd ../../../../terraform
terraform apply
```

### "AWS credentials not configured"

**Solution:** Configure AWS CLI:
```bash
aws configure
```

## Need More Help?

- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions
- See [README.md](README.md) for complete documentation
- Check AWS CloudWatch Logs for Lambda errors

## Summary

```bash
# 1. Setup environment
bash setup_test_env.sh

# 2. Test S3 access
python test_s3_access.py

# 3. Run integration tests
bash run_tests.sh
```

That's it! 🚀
