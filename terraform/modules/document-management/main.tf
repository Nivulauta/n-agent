# Document Management Lambda Functions

locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
}

# Archive Upload Lambda
data "archive_file" "upload" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/documents/upload/dist"
  output_path = "${path.module}/../../../lambda/documents/upload/dist/index.zip"
}

# Archive List Lambda
data "archive_file" "list" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/documents/list/dist"
  output_path = "${path.module}/../../../lambda/documents/list/dist/index.zip"
}

# Archive Delete Lambda
data "archive_file" "delete" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/documents/delete/dist"
  output_path = "${path.module}/../../../lambda/documents/delete/dist/index.zip"
}

# IAM Role for Upload Lambda
resource "aws_iam_role" "upload_role" {
  name = "${var.environment}-document-upload-lambda-role"

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
    Name = "${var.environment}-document-upload-lambda-role"
  }
}

# IAM Policy for Upload Lambda
resource "aws_iam_role_policy" "upload_policy" {
  name = "${var.environment}-document-upload-lambda-policy"
  role = aws_iam_role.upload_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = var.document_metadata_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${var.documents_bucket_arn}/*"
      },
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

# Upload Lambda Function
resource "aws_lambda_function" "upload" {
  filename         = data.archive_file.upload.output_path
  source_code_hash = data.archive_file.upload.output_base64sha256
  function_name    = "${var.environment}-document-upload"
  role             = aws_iam_role.upload_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 512

  environment {
    variables = {
      DOCUMENT_METADATA_TABLE = var.document_metadata_table_name
      DOCUMENTS_BUCKET        = var.documents_bucket_name
      CORS_ORIGIN             = var.cors_origin
    }
  }

  tags = {
    Name = "${var.environment}-document-upload"
  }
}

# CloudWatch Log Group for Upload
resource "aws_cloudwatch_log_group" "upload_logs" {
  name              = "/aws/lambda/${aws_lambda_function.upload.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-document-upload-logs"
  }
}

# IAM Role for List Lambda
resource "aws_iam_role" "list_role" {
  name = "${var.environment}-document-list-lambda-role"

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
    Name = "${var.environment}-document-list-lambda-role"
  }
}

# IAM Policy for List Lambda
resource "aws_iam_role_policy" "list_policy" {
  name = "${var.environment}-document-list-lambda-policy"
  role = aws_iam_role.list_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = [
          var.document_metadata_table_arn,
          "${var.document_metadata_table_arn}/index/uploadedBy-index"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# List Lambda Function
resource "aws_lambda_function" "list" {
  filename         = data.archive_file.list.output_path
  source_code_hash = data.archive_file.list.output_base64sha256
  function_name    = "${var.environment}-document-list"
  role             = aws_iam_role.list_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 512

  environment {
    variables = {
      DOCUMENT_METADATA_TABLE = var.document_metadata_table_name
      CORS_ORIGIN             = var.cors_origin
    }
  }

  tags = {
    Name = "${var.environment}-document-list"
  }
}

# CloudWatch Log Group for List
resource "aws_cloudwatch_log_group" "list_logs" {
  name              = "/aws/lambda/${aws_lambda_function.list.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-document-list-logs"
  }
}

# IAM Role for Delete Lambda
resource "aws_iam_role" "delete_role" {
  name = "${var.environment}-document-delete-lambda-role"

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
    Name = "${var.environment}-document-delete-lambda-role"
  }
}

# IAM Policy for Delete Lambda
resource "aws_iam_role_policy" "delete_policy" {
  name = "${var.environment}-document-delete-lambda-policy"
  role = aws_iam_role.delete_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:DeleteItem"
        ]
        Resource = var.document_metadata_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.documents_bucket_arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:DeleteObject"
        ]
        Resource = "${var.documents_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = var.kms_key_arn
      },
      {
        Effect = "Allow"
        Action = [
          "es:ESHttpDelete"
        ]
        Resource = "${var.opensearch_domain_arn}/*"
      }
    ]
  })
}

# Attach VPC execution policy for Delete Lambda (for OpenSearch access)
resource "aws_iam_role_policy_attachment" "delete_vpc_execution" {
  role       = aws_iam_role.delete_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Delete Lambda Function
resource "aws_lambda_function" "delete" {
  filename         = data.archive_file.delete.output_path
  source_code_hash = data.archive_file.delete.output_base64sha256
  function_name    = "${var.environment}-document-delete"
  role             = aws_iam_role.delete_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 512

  environment {
    variables = {
      DOCUMENT_METADATA_TABLE = var.document_metadata_table_name
      DOCUMENTS_BUCKET        = var.documents_bucket_name
      OPENSEARCH_ENDPOINT     = var.opensearch_endpoint
      OPENSEARCH_INDEX        = var.opensearch_index
      CORS_ORIGIN             = var.cors_origin
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tags = {
    Name = "${var.environment}-document-delete"
  }
}

# CloudWatch Log Group for Delete
resource "aws_cloudwatch_log_group" "delete_logs" {
  name              = "/aws/lambda/${aws_lambda_function.delete.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-document-delete-logs"
  }
}
