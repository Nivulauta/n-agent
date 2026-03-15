# Agent Module — Consolidates agent-related infrastructure:
#   - MCP Server management Lambda (REST API handler)
#   - IAM role with bedrock:InvokeInlineAgent permission for agent execution
#   - CloudWatch logging

locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
}

# ── MCP Servers REST API Lambda ──────────────────────────────────────────────

data "archive_file" "mcp_servers" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/agent/mcp-servers/dist"
  output_path = "${path.module}/../../../lambda/agent/mcp-servers/dist/index.zip"
}

resource "aws_iam_role" "mcp_servers_role" {
  name = "${var.environment}-agent-mcp-servers-lambda-role"

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
    Name = "${var.environment}-agent-mcp-servers-lambda-role"
  }
}

resource "aws_iam_role_policy" "mcp_servers_policy" {
  name = "${var.environment}-agent-mcp-servers-lambda-policy"
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

resource "aws_lambda_function" "mcp_servers" {
  filename         = data.archive_file.mcp_servers.output_path
  source_code_hash = data.archive_file.mcp_servers.output_base64sha256
  function_name    = "${var.environment}-agent-mcp-servers"
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
    Name = "${var.environment}-agent-mcp-servers"
  }
}

resource "aws_cloudwatch_log_group" "mcp_servers_logs" {
  name              = "/aws/lambda/${aws_lambda_function.mcp_servers.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-agent-mcp-servers-logs"
  }
}


# ── Agent Execution IAM Role ─────────────────────────────────────────────────
# Dedicated role for Lambda functions that invoke the Bedrock InlineAgent API.
# This role is intended for the message handler (or any future Lambda) that
# needs to call bedrock:InvokeInlineAgent.

resource "aws_iam_role" "agent_execution_role" {
  name = "${var.environment}-agent-execution-role"

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
    Name = "${var.environment}-agent-execution-role"
  }
}

resource "aws_iam_role_policy" "agent_execution_policy" {
  name = "${var.environment}-agent-execution-policy"
  role = aws_iam_role.agent_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Sid    = "BedrockInlineAgent"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeInlineAgent",
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBMCPConfig"
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = var.mcp_server_config_table_arn
      },
      {
        Sid    = "KMSDecrypt"
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
