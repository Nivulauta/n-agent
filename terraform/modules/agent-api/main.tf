# Agent API Lambda Functions — MCP Server Management

locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
}

# Archive MCP Servers Lambda
data "archive_file" "mcp_servers" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/agent/mcp-servers/dist"
  output_path = "${path.module}/../../../lambda/agent/mcp-servers/dist/index.zip"
}

# IAM Role for MCP Servers Lambda
resource "aws_iam_role" "mcp_servers_role" {
  name = "${var.environment}-mcp-servers-lambda-role"

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
    Name = "${var.environment}-mcp-servers-lambda-role"
  }
}

# IAM Policy for MCP Servers Lambda
resource "aws_iam_role_policy" "mcp_servers_policy" {
  name = "${var.environment}-mcp-servers-lambda-policy"
  role = aws_iam_role.mcp_servers_role.id

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
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = var.mcp_server_config_table_arn
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

# MCP Servers Lambda Function
resource "aws_lambda_function" "mcp_servers" {
  filename         = data.archive_file.mcp_servers.output_path
  source_code_hash = data.archive_file.mcp_servers.output_base64sha256
  function_name    = "${var.environment}-mcp-servers"
  role             = aws_iam_role.mcp_servers_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = local.lambda_timeout
  memory_size      = 1024

  environment {
    variables = {
      MCP_SERVER_CONFIG_TABLE = var.mcp_server_config_table_name
      CORS_ORIGIN             = var.cors_origin
    }
  }

  tags = {
    Name = "${var.environment}-mcp-servers"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "mcp_servers_logs" {
  name              = "/aws/lambda/${aws_lambda_function.mcp_servers.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-mcp-servers-logs"
  }
}
