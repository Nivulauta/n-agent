# Document Processor Lambda Module
# This module creates the Lambda function for PDF text extraction and chunking,
# and configures S3 event notifications to trigger processing on document upload.

# Package Lambda layer with dependencies
# Note: Layer must be pre-built using build_layer_docker.ps1 or build_layer_docker.sh
data "archive_file" "lambda_layer" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/document-processor/extract-text/layer"
  output_path = "${path.root}/.terraform/lambda/document-processor-layer.zip"
}

# Lambda Layer for Python dependencies
resource "aws_lambda_layer_version" "document_processor_dependencies" {
  filename            = data.archive_file.lambda_layer.output_path
  layer_name          = "${var.environment}-chatbot-document-processor-deps"
  compatible_runtimes = ["python3.11", "python3.12"]
  source_code_hash    = data.archive_file.lambda_layer.output_base64sha256

  description = "Dependencies for document processor: pdfplumber, tiktoken, boto3"

  depends_on = [data.archive_file.lambda_layer]
}

# Package Lambda function code (without dependencies)
data "archive_file" "document_processor" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/document-processor/extract-text"
  output_path = "${path.root}/.terraform/lambda/document-processor.zip"
  excludes = [
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    "test_*.py",
    "requirements.txt",
    "*.md",
    "src/",
    "layer/",
    "layer",
    "*.zip",
    "*.sh",
    "*.ps1",
    ".gitignore"
  ]
}

# IAM Role for Document Processor Lambda
resource "aws_iam_role" "document_processor" {
  name = "${var.environment}-chatbot-document-processor-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-chatbot-document-processor-role"
    Environment = var.environment
  }
}

# IAM Policy for Document Processor Lambda
resource "aws_iam_role_policy" "document_processor" {
  name = "${var.environment}-chatbot-document-processor-policy"
  role = aws_iam_role.document_processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs permissions
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # S3 permissions - read from uploads/, write to processed/ and failed/
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${var.documents_bucket_arn}/uploads/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "${var.documents_bucket_arn}/processed/*",
          "${var.documents_bucket_arn}/failed/*"
        ]
      },
      # DynamoDB permissions - update DocumentMetadata table
      {
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem"
        ]
        Resource = var.document_metadata_table_arn
      },
      # SNS permissions - publish to failed processing topic
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = var.failed_processing_sns_topic_arn != "" ? var.failed_processing_sns_topic_arn : "*"
      },
      # KMS permissions for S3 encryption
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# Document Processor Lambda Function
resource "aws_lambda_function" "document_processor" {
  function_name    = "${var.environment}-chatbot-document-processor"
  filename         = data.archive_file.document_processor.output_path
  source_code_hash = data.archive_file.document_processor.output_base64sha256
  handler          = "index.handler"
  runtime          = "python3.11"
  role             = aws_iam_role.document_processor.arn
  timeout          = 300  # 5 minutes for large PDFs
  memory_size      = 3008 # High memory for PDF processing

  # Attach Lambda layer with dependencies
  layers = [aws_lambda_layer_version.document_processor_dependencies.arn]

  environment {
    variables = {
      DOCUMENT_METADATA_TABLE     = var.document_metadata_table_name
      FAILED_PROCESSING_SNS_TOPIC = var.failed_processing_sns_topic_arn
      EMBEDDING_GENERATOR_LAMBDA  = aws_lambda_function.generate_embeddings.function_name
      LOG_LEVEL                   = "INFO"
    }
  }

  tags = {
    Name        = "${var.environment}-chatbot-document-processor"
    Environment = var.environment
  }

  depends_on = [
    aws_lambda_layer_version.document_processor_dependencies,
    aws_lambda_function.generate_embeddings
  ]
}

# Lambda Permission for S3 to invoke the function
resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.document_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.documents_bucket_arn
}

# S3 Bucket Notification Configuration
# This triggers the Document Processor Lambda when objects are created in uploads/ prefix
resource "aws_s3_bucket_notification" "document_upload" {
  bucket = var.documents_bucket_name

  lambda_function {
    lambda_function_arn = aws_lambda_function.document_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".pdf"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke]
}

# ============================================================================
# Generate Embeddings Lambda
# ============================================================================

# Package Generate Embeddings Lambda function code
data "archive_file" "generate_embeddings" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/document-processor/generate-embeddings/dist"
  output_path = "${path.root}/.terraform/lambda/generate-embeddings.zip"
}

# IAM Role for Generate Embeddings Lambda
resource "aws_iam_role" "generate_embeddings" {
  name = "${var.environment}-chatbot-generate-embeddings-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-chatbot-generate-embeddings-role"
    Environment = var.environment
  }
}

# IAM Policy for Generate Embeddings Lambda
resource "aws_iam_role_policy" "generate_embeddings" {
  name = "${var.environment}-chatbot-generate-embeddings-policy"
  role = aws_iam_role.generate_embeddings.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs permissions
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # S3 permissions - read from processed/
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = "${var.documents_bucket_arn}/processed/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.documents_bucket_arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["processed/*"]
          }
        }
      },
      # Bedrock permissions - invoke Titan Embeddings model
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1",
          "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0"
        ]
      },
      # KMS permissions for S3 encryption
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = var.kms_key_arn
      },
      # DynamoDB permissions - update DocumentMetadata table
      {
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem"
        ]
        Resource = var.document_metadata_table_arn
      },
      # OpenSearch permissions - index embeddings with bulk operations
      {
        Effect = "Allow"
        Action = [
          "es:ESHttpPost",
          "es:ESHttpPut",
          "es:ESHttpGet",
          "es:ESHttpHead"
        ]
        Resource = [
          "arn:aws:es:*:*:domain/*/documents",
          "arn:aws:es:*:*:domain/*/documents/*",
          "arn:aws:es:*:*:domain/*/_bulk"
        ]
      },
      # VPC permissions for Lambda in VPC
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      },
      # CloudWatch Metrics permissions
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "ChatbotMetrics"
          }
        }
      }
    ]
  })
}

# Generate Embeddings Lambda Function
resource "aws_lambda_function" "generate_embeddings" {
  function_name    = "${var.environment}-chatbot-generate-embeddings"
  filename         = data.archive_file.generate_embeddings.output_path
  source_code_hash = data.archive_file.generate_embeddings.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.generate_embeddings.arn
  timeout          = 300 # 5 minutes for large documents
  memory_size      = 1024

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      LOG_LEVEL               = "INFO"
      OPENSEARCH_ENDPOINT     = var.opensearch_endpoint
      OPENSEARCH_INDEX        = var.opensearch_index_name
      DOCUMENT_METADATA_TABLE = var.document_metadata_table_name
    }
  }

  tags = {
    Name        = "${var.environment}-chatbot-generate-embeddings"
    Environment = var.environment
  }
}

# CloudWatch Log Group for Generate Embeddings Lambda
resource "aws_cloudwatch_log_group" "generate_embeddings" {
  name              = "/aws/lambda/${aws_lambda_function.generate_embeddings.function_name}"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-generate-embeddings-logs"
    Environment = var.environment
  }
}

# ============================================================================
# Integration: Document Processor → Generate Embeddings
# ============================================================================

# IAM Policy to allow Document Processor to invoke Generate Embeddings Lambda
resource "aws_iam_role_policy" "document_processor_invoke_embeddings" {
  name = "${var.environment}-chatbot-document-processor-invoke-embeddings"
  role = aws_iam_role.document_processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = aws_lambda_function.generate_embeddings.arn
      }
    ]
  })
}
