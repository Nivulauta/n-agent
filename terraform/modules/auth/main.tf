# Authentication Service Lambda Functions

locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
}

# Archive Lambda Authorizer
data "archive_file" "authorizer" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/auth/authorizer/dist"
  output_path = "${path.module}/../../../lambda/auth/authorizer/dist/index.zip"
}

# Archive Login Lambda
data "archive_file" "login" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/auth/login/dist"
  output_path = "${path.module}/../../../lambda/auth/login/dist/index.zip"
}

# Archive Logout Lambda
data "archive_file" "logout" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/auth/logout/dist"
  output_path = "${path.module}/../../../lambda/auth/logout/dist/index.zip"
}

# IAM Role for Lambda Authorizer
resource "aws_iam_role" "authorizer_role" {
  name = "${var.environment}-authorizer-lambda-role"

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
    Name = "${var.environment}-authorizer-lambda-role"
  }
}

# IAM Policy for Lambda Authorizer
resource "aws_iam_role_policy" "authorizer_policy" {
  name = "${var.environment}-authorizer-lambda-policy"
  role = aws_iam_role.authorizer_role.id

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
          "dynamodb:GetItem"
        ]
        Resource = var.sessions_table_arn
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

# Lambda Authorizer Function
resource "aws_lambda_function" "authorizer" {
  filename         = data.archive_file.authorizer.output_path
  source_code_hash = data.archive_file.authorizer.output_base64sha256
  function_name    = "${var.environment}-api-authorizer"
  role             = aws_iam_role.authorizer_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 256

  environment {
    variables = {
      SESSIONS_TABLE = var.sessions_table_name
      JWT_SECRET     = var.jwt_secret
    }
  }

  tags = {
    Name = "${var.environment}-api-authorizer"
  }
}

# CloudWatch Log Group for Authorizer
resource "aws_cloudwatch_log_group" "authorizer_logs" {
  name              = "/aws/lambda/${aws_lambda_function.authorizer.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-authorizer-logs"
  }
}

# IAM Role for Login Lambda
resource "aws_iam_role" "login_role" {
  name = "${var.environment}-login-lambda-role"

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
    Name = "${var.environment}-login-lambda-role"
  }
}

# IAM Policy for Login Lambda
resource "aws_iam_role_policy" "login_policy" {
  name = "${var.environment}-login-lambda-policy"
  role = aws_iam_role.login_role.id

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
          "dynamodb:PutItem"
        ]
        Resource = [
          var.sessions_table_arn,
          var.users_table_arn
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

# Login Lambda Function
resource "aws_lambda_function" "login" {
  filename         = data.archive_file.login.output_path
  source_code_hash = data.archive_file.login.output_base64sha256
  function_name    = "${var.environment}-auth-login"
  role             = aws_iam_role.login_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 512

  environment {
    variables = {
      SESSIONS_TABLE = var.sessions_table_name
      USERS_TABLE    = var.users_table_name
      JWT_SECRET     = var.jwt_secret
      CORS_ORIGIN    = var.cors_origin
    }
  }

  tags = {
    Name = "${var.environment}-auth-login"
  }
}

# CloudWatch Log Group for Login
resource "aws_cloudwatch_log_group" "login_logs" {
  name              = "/aws/lambda/${aws_lambda_function.login.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-login-logs"
  }
}

# IAM Role for Logout Lambda
resource "aws_iam_role" "logout_role" {
  name = "${var.environment}-logout-lambda-role"

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
    Name = "${var.environment}-logout-lambda-role"
  }
}

# IAM Policy for Logout Lambda
resource "aws_iam_role_policy" "logout_policy" {
  name = "${var.environment}-logout-lambda-policy"
  role = aws_iam_role.logout_role.id

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
          "dynamodb:DeleteItem"
        ]
        Resource = var.sessions_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = "*"
      }
    ]
  })
}

# Logout Lambda Function
resource "aws_lambda_function" "logout" {
  filename         = data.archive_file.logout.output_path
  source_code_hash = data.archive_file.logout.output_base64sha256
  function_name    = "${var.environment}-auth-logout"
  role             = aws_iam_role.logout_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 256

  environment {
    variables = {
      SESSIONS_TABLE = var.sessions_table_name
      CORS_ORIGIN    = var.cors_origin
    }
  }

  tags = {
    Name = "${var.environment}-auth-logout"
  }
}

# CloudWatch Log Group for Logout
resource "aws_cloudwatch_log_group" "logout_logs" {
  name              = "/aws/lambda/${aws_lambda_function.logout.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-logout-logs"
  }
}
