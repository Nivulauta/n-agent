# Chat History Lambda Module
# This module creates the Lambda function for retrieving chat conversation history

# Package Chat History Lambda function code
data "archive_file" "chat_history" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/chat/history/dist"
  output_path = "${path.root}/.terraform/lambda/chat-history.zip"
}

# IAM Role for Chat History Lambda
resource "aws_iam_role" "chat_history" {
  name = "${var.environment}-chatbot-chat-history-role"

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
    Name        = "${var.environment}-chatbot-chat-history-role"
    Environment = var.environment
  }
}

# IAM Policy for Chat History Lambda
resource "aws_iam_role_policy" "chat_history" {
  name = "${var.environment}-chatbot-chat-history-policy"
  role = aws_iam_role.chat_history.id

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
      # DynamoDB permissions - query ChatHistory table
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem"
        ]
        Resource = [
          var.chat_history_table_arn,
          "${var.chat_history_table_arn}/index/*"
        ]
      },
      # KMS permissions for message decryption
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

# Chat History Lambda Function
resource "aws_lambda_function" "chat_history" {
  function_name    = "${var.environment}-chatbot-chat-history"
  filename         = data.archive_file.chat_history.output_path
  source_code_hash = data.archive_file.chat_history.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.chat_history.arn
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      CHAT_HISTORY_TABLE_NAME = var.chat_history_table_name
      KMS_KEY_ID              = var.kms_key_id
      AWS_REGION              = var.aws_region
      LOG_LEVEL               = "INFO"
    }
  }

  tags = {
    Name        = "${var.environment}-chatbot-chat-history"
    Environment = var.environment
  }
}

# CloudWatch Log Group for Chat History Lambda
resource "aws_cloudwatch_log_group" "chat_history" {
  name              = "/aws/lambda/${aws_lambda_function.chat_history.function_name}"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-chat-history-logs"
    Environment = var.environment
  }
}
