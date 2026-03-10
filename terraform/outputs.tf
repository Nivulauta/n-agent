output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.networking.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.networking.public_subnet_ids
}

output "s3_documents_bucket_name" {
  description = "S3 bucket name for documents"
  value       = module.storage.documents_bucket_name
}

output "s3_documents_bucket_arn" {
  description = "S3 bucket ARN for documents"
  value       = module.storage.documents_bucket_arn
}

output "dynamodb_sessions_table_name" {
  description = "DynamoDB Sessions table name"
  value       = module.database.sessions_table_name
}

output "dynamodb_chat_history_table_name" {
  description = "DynamoDB ChatHistory table name"
  value       = module.database.chat_history_table_name
}

output "dynamodb_rate_limits_table_name" {
  description = "DynamoDB RateLimits table name"
  value       = module.database.rate_limits_table_name
}

output "dynamodb_document_metadata_table_name" {
  description = "DynamoDB DocumentMetadata table name"
  value       = module.database.document_metadata_table_name
}

output "opensearch_endpoint" {
  description = "OpenSearch cluster endpoint"
  value       = module.opensearch.endpoint
}

output "opensearch_domain_arn" {
  description = "OpenSearch domain ARN"
  value       = module.opensearch.domain_arn
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = module.security.kms_key_arn
}

output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = module.security.lambda_execution_role_arn
}

output "cloudwatch_log_group_names" {
  description = "CloudWatch log group names"
  value       = module.monitoring.log_group_names
}

output "websocket_api_endpoint" {
  description = "WebSocket API endpoint URL"
  value       = module.websocket.websocket_api_endpoint
}

output "websocket_stage_url" {
  description = "WebSocket stage URL"
  value       = module.websocket.websocket_stage_url
}

output "dynamodb_connections_table_name" {
  description = "DynamoDB WebSocket Connections table name"
  value       = module.database.connections_table_name
}

output "rest_api_id" {
  description = "REST API Gateway ID"
  value       = module.rest_api.rest_api_id
}

output "rest_api_url" {
  description = "REST API Gateway URL"
  value       = module.rest_api.stage_url
}

output "rest_api_stage_name" {
  description = "REST API Gateway stage name"
  value       = module.rest_api.stage_name
}

output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = module.cache.redis_endpoint
}

output "redis_port" {
  description = "Redis port"
  value       = module.cache.redis_port
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint address"
  value       = module.cache.redis_reader_endpoint
}

output "redis_configuration_endpoint" {
  description = "Redis configuration endpoint"
  value       = module.cache.redis_configuration_endpoint
}

output "vector_store_init_function_name" {
  description = "Vector store init index Lambda function name"
  value       = module.vector_store_init.function_name
}

output "vector_store_init_function_arn" {
  description = "Vector store init index Lambda function ARN"
  value       = module.vector_store_init.function_arn
}

output "vector_store_init_lambda_role_arn" {
  description = "Vector store init Lambda IAM role ARN (needed for OpenSearch role mapping)"
  value       = module.vector_store_init.lambda_role_arn
}

output "vector_store_init_lambda_role_name" {
  description = "Vector store init Lambda IAM role name"
  value       = module.vector_store_init.lambda_role_name
}

output "opensearch_configure_access_function_name" {
  description = "OpenSearch access configuration Lambda function name"
  value       = module.opensearch_access_config.function_name
}

output "opensearch_configure_access_function_arn" {
  description = "OpenSearch access configuration Lambda function ARN"
  value       = module.opensearch_access_config.function_arn
}

# Notifications outputs
output "failed_processing_topic_arn" {
  description = "ARN of the failed processing SNS topic"
  value       = module.notifications.failed_processing_topic_arn
}

output "failed_processing_topic_name" {
  description = "Name of the failed processing SNS topic"
  value       = module.notifications.failed_processing_topic_name
}

output "system_alerts_topic_arn" {
  description = "ARN of the system alerts SNS topic"
  value       = module.notifications.system_alerts_topic_arn
}

output "system_alerts_topic_name" {
  description = "Name of the system alerts SNS topic"
  value       = module.notifications.system_alerts_topic_name
}

output "operational_notifications_topic_arn" {
  description = "ARN of the operational notifications SNS topic"
  value       = module.notifications.operational_notifications_topic_arn
}

output "operational_notifications_topic_name" {
  description = "Name of the operational notifications SNS topic"
  value       = module.notifications.operational_notifications_topic_name
}

# Monitoring outputs
output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.monitoring.dashboard_name
}

output "cloudwatch_dashboard_arn" {
  description = "CloudWatch dashboard ARN"
  value       = module.monitoring.dashboard_arn
}

# Frontend outputs
output "frontend_bucket_name" {
  description = "Name of the S3 bucket for frontend static hosting"
  value       = module.frontend.frontend_bucket_name
}

output "frontend_bucket_arn" {
  description = "ARN of the S3 bucket for frontend static hosting"
  value       = module.frontend.frontend_bucket_arn
}

output "frontend_bucket_website_endpoint" {
  description = "Website endpoint of the S3 bucket"
  value       = module.frontend.frontend_bucket_website_endpoint
}

output "cloudfront_oai_id" {
  description = "CloudFront Origin Access Identity ID"
  value       = module.frontend.cloudfront_oai_id
}

output "cloudfront_oai_iam_arn" {
  description = "IAM ARN of CloudFront Origin Access Identity"
  value       = module.frontend.cloudfront_oai_iam_arn
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution for cache invalidation"
  value       = module.frontend.cloudfront_distribution_id
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = module.frontend.cloudfront_distribution_arn
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = module.frontend.cloudfront_domain_name
}

output "frontend_url" {
  description = "URL to access the frontend application"
  value       = module.frontend.frontend_url
}
