locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
}

# Data sources
data "aws_region" "current" {}

# Archive WebSocket Connect Handler
data "archive_file" "connect" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/websocket/connect/dist"
  output_path = "${path.module}/../../../lambda/websocket/connect/dist/index.zip"
}

# Archive WebSocket Disconnect Handler
data "archive_file" "disconnect" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/websocket/disconnect/dist"
  output_path = "${path.module}/../../../lambda/websocket/disconnect/dist/index.zip"
}

# Archive WebSocket Message Handler
data "archive_file" "message" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/websocket/message/dist"
  output_path = "${path.module}/../../../lambda/websocket/message/dist/index.zip"
}

# IAM Role for WebSocket Connect Handler
resource "aws_iam_role" "connect_role" {
  name = "${var.environment}-websocket-connect-role"

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
    Name = "${var.environment}-websocket-connect-role"
  }
}

resource "aws_iam_role_policy" "connect_policy" {
  name = "${var.environment}-websocket-connect-policy"
  role = aws_iam_role.connect_role.id

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
        Resource = var.connections_table_arn
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

# WebSocket Connect Lambda
resource "aws_lambda_function" "connect" {
  filename         = data.archive_file.connect.output_path
  source_code_hash = data.archive_file.connect.output_base64sha256
  function_name    = "${var.environment}-websocket-connect"
  role             = aws_iam_role.connect_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = 30
  memory_size      = 1024

  # Reserved concurrency to support 100 concurrent connections
  reserved_concurrent_executions = 100

  environment {
    variables = {
      CONNECTIONS_TABLE = var.connections_table_name
    }
  }

  tags = {
    Name = "${var.environment}-websocket-connect"
  }
}

resource "aws_cloudwatch_log_group" "connect_logs" {
  name              = "/aws/lambda/${aws_lambda_function.connect.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-websocket-connect-logs"
  }
}

# IAM Role for WebSocket Disconnect Handler
resource "aws_iam_role" "disconnect_role" {
  name = "${var.environment}-websocket-disconnect-role"

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
    Name = "${var.environment}-websocket-disconnect-role"
  }
}

resource "aws_iam_role_policy" "disconnect_policy" {
  name = "${var.environment}-websocket-disconnect-policy"
  role = aws_iam_role.disconnect_role.id

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
          "dynamodb:DeleteItem",
          "dynamodb:GetItem"
        ]
        Resource = var.connections_table_arn
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

# WebSocket Disconnect Lambda
resource "aws_lambda_function" "disconnect" {
  filename         = data.archive_file.disconnect.output_path
  source_code_hash = data.archive_file.disconnect.output_base64sha256
  function_name    = "${var.environment}-websocket-disconnect"
  role             = aws_iam_role.disconnect_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = 30
  memory_size      = 1024

  # Reserved concurrency to support 100 concurrent disconnections
  reserved_concurrent_executions = 100

  environment {
    variables = {
      CONNECTIONS_TABLE = var.connections_table_name
    }
  }

  tags = {
    Name = "${var.environment}-websocket-disconnect"
  }
}

resource "aws_cloudwatch_log_group" "disconnect_logs" {
  name              = "/aws/lambda/${aws_lambda_function.disconnect.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-websocket-disconnect-logs"
  }
}

# IAM Role for WebSocket Message Handler (placeholder for future implementation)
resource "aws_iam_role" "message_role" {
  name = "${var.environment}-websocket-message-role"

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
    Name = "${var.environment}-websocket-message-role"
  }
}

resource "aws_iam_role_policy" "message_policy" {
  name = "${var.environment}-websocket-message-policy"
  role = aws_iam_role.message_role.id

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
          "dynamodb:Query"
        ]
        Resource = var.connections_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = var.rate_limits_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = var.chat_history_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${var.websocket_api_execution_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:InvokeInlineAgent"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/*",
          "arn:aws:bedrock:*:*:inference-profile/*",
          "arn:aws:bedrock:${data.aws_region.current.name}:*:inference-profile/*",
          "arn:aws:bedrock:*:*:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "es:ESHttpGet",
          "es:ESHttpPost"
        ]
        Resource = "${var.opensearch_domain_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = var.mcp_server_config_table_arn
      },
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

# WebSocket Message Lambda 
resource "aws_lambda_function" "message" {
  filename         = data.archive_file.message.output_path
  source_code_hash = data.archive_file.message.output_base64sha256
  function_name    = "${var.environment}-websocket-message"
  role             = aws_iam_role.message_role.arn
  handler          = "index.handler"
  runtime          = local.lambda_runtime
  timeout          = 120
  memory_size      = 1536

  # Reserved concurrency to support 100 concurrent message handlers
  reserved_concurrent_executions = 100

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      CONNECTIONS_TABLE       = var.connections_table_name
      WEBSOCKET_API_ID        = var.websocket_api_id
      RATE_LIMITS_TABLE       = var.rate_limits_table_name
      CHAT_HISTORY_TABLE      = var.chat_history_table_name
      KMS_KEY_ID              = var.kms_key_arn
      OPENSEARCH_ENDPOINT     = var.opensearch_endpoint
      CACHE_HOST              = var.cache_endpoint
      CACHE_PORT              = tostring(var.cache_port)
      MCP_SERVER_CONFIG_TABLE = var.mcp_server_config_table_name
      USE_BEDROCK_AGENT       = tostring(var.use_bedrock_agent)
      AGENT_FOUNDATION_MODEL  = var.agent_foundation_model
      AGENT_MAX_ITERATIONS    = tostring(var.agent_max_iterations)
    }
  }

  tags = {
    Name = "${var.environment}-websocket-message"
  }
}

resource "aws_cloudwatch_log_group" "message_logs" {
  name              = "/aws/lambda/${aws_lambda_function.message.function_name}"
  retention_in_days = 365

  tags = {
    Name = "${var.environment}-websocket-message-logs"
  }
}
