# Chat History Lambda Module Outputs

output "lambda_function_arn" {
  description = "ARN of the Chat History Lambda function"
  value       = aws_lambda_function.chat_history.arn
}

output "lambda_function_name" {
  description = "Name of the Chat History Lambda function"
  value       = aws_lambda_function.chat_history.function_name
}

output "lambda_invoke_arn" {
  description = "Invoke ARN of the Chat History Lambda function"
  value       = aws_lambda_function.chat_history.invoke_arn
}

output "lambda_role_arn" {
  description = "ARN of the IAM role for Chat History Lambda"
  value       = aws_iam_role.chat_history.arn
}

output "lambda_role_name" {
  description = "Name of the IAM role for Chat History Lambda"
  value       = aws_iam_role.chat_history.name
}

output "log_group_name" {
  description = "Name of the CloudWatch Log Group for Chat History Lambda"
  value       = aws_cloudwatch_log_group.chat_history.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch Log Group for Chat History Lambda"
  value       = aws_cloudwatch_log_group.chat_history.arn
}
