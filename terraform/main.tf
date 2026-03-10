terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "terraform-state-chatbot-177981160483"
    key            = "chatbot/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "terraform-locks-dev"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "AWS-Claude-RAG-Chatbot"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id = "/chatbot/jwt-secret"
}

# Local variables
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  jwt_secret = data.aws_secretsmanager_secret_version.jwt_secret.secret_string

  common_tags = {
    Project     = "AWS-Claude-RAG-Chatbot"
    Environment = var.environment
  }
}

# Modules
module "networking" {
  source = "./modules/networking"

  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs
}

module "storage" {
  source = "./modules/storage"

  environment = var.environment
  account_id  = local.account_id
  kms_key_arn = module.security.kms_key_arn
  cors_origin = module.frontend.frontend_url
}

module "database" {
  source = "./modules/database"

  environment = var.environment
  kms_key_arn = module.security.kms_key_arn
}

module "opensearch" {
  source = "./modules/opensearch"

  environment          = var.environment
  vpc_id               = module.networking.vpc_id
  subnet_ids           = module.networking.private_subnet_ids
  security_group_ids   = [module.security.opensearch_security_group_id]
  instance_type        = var.opensearch_instance_type
  instance_count       = var.opensearch_instance_count
  master_user_password = var.opensearch_master_user_password
  master_user_arn      = module.opensearch_access_config.configure_access_role_arn
  lambda_role_arns = [
    module.websocket_handlers.message_role_arn,
    module.document_processor.generate_embeddings_role_arn,
    module.vector_store_init.lambda_role_arn,
    module.document_management.delete_role_arn,
    module.opensearch_access_config.configure_access_role_arn
  ]
}

module "security" {
  source = "./modules/security"

  environment = var.environment
  vpc_id      = module.networking.vpc_id
  account_id  = local.account_id
}

module "monitoring" {
  source = "./modules/monitoring"

  environment             = var.environment
  system_alerts_topic_arn = module.notifications.system_alerts_topic_arn
  aws_region              = var.aws_region
}

module "notifications" {
  source = "./modules/notifications"

  environment = var.environment
  kms_key_id  = module.security.kms_key_id
  alert_email = var.alert_email
}

module "cache" {
  source = "./modules/cache"

  environment                  = var.environment
  vpc_id                       = module.networking.vpc_id
  subnet_ids                   = module.networking.private_subnet_ids
  lambda_security_group_id     = module.security.lambda_security_group_id
  node_type                    = var.redis_node_type
  num_cache_nodes              = var.redis_num_cache_nodes
  snapshot_retention_limit     = var.redis_snapshot_retention_limit
  enable_encryption_at_rest    = var.redis_enable_encryption_at_rest
  enable_encryption_in_transit = var.redis_enable_encryption_in_transit
}

module "auth" {
  source = "./modules/auth"

  environment         = var.environment
  sessions_table_name = module.database.sessions_table_name
  sessions_table_arn  = module.database.sessions_table_arn
  users_table_name    = module.database.users_table_name
  users_table_arn     = module.database.users_table_arn
  jwt_secret          = local.jwt_secret
  kms_key_arn         = module.security.kms_key_arn
  cors_origin         = module.frontend.frontend_url
}

module "websocket_handlers" {
  source = "./modules/websocket-handlers"

  environment                 = var.environment
  connections_table_name      = module.database.connections_table_name
  connections_table_arn       = module.database.connections_table_arn
  websocket_api_id            = module.websocket.websocket_api_id
  websocket_api_execution_arn = module.websocket.websocket_api_execution_arn
  kms_key_arn                 = module.security.kms_key_arn
  rate_limits_table_name      = module.database.rate_limits_table_name
  rate_limits_table_arn       = module.database.rate_limits_table_arn
  chat_history_table_name     = module.database.chat_history_table_name
  chat_history_table_arn      = module.database.chat_history_table_arn
  opensearch_endpoint         = module.opensearch.endpoint
  opensearch_domain_arn       = module.opensearch.domain_arn
  cache_endpoint              = module.cache.redis_endpoint
  cache_port                  = module.cache.redis_port
  private_subnet_ids          = module.networking.private_subnet_ids
  lambda_security_group_id    = module.security.lambda_security_group_id
}

module "websocket" {
  source = "./modules/websocket"

  environment              = var.environment
  authorizer_function_arn  = module.auth.authorizer_function_arn
  authorizer_invoke_arn    = module.auth.authorizer_invoke_arn
  authorizer_function_name = module.auth.authorizer_function_name
  connect_handler_arn      = module.websocket_handlers.connect_function_arn
  connect_handler_name     = module.websocket_handlers.connect_function_name
  disconnect_handler_arn   = module.websocket_handlers.disconnect_function_arn
  disconnect_handler_name  = module.websocket_handlers.disconnect_function_name
  message_handler_arn      = module.websocket_handlers.message_function_arn
  message_handler_name     = module.websocket_handlers.message_function_name
}

module "rest_api" {
  source = "./modules/rest-api"

  environment                   = var.environment
  authorizer_function_arn       = module.auth.authorizer_function_arn
  authorizer_invoke_arn         = module.auth.authorizer_invoke_arn
  authorizer_function_name      = module.auth.authorizer_function_name
  login_function_name           = module.auth.login_function_name
  login_invoke_arn              = module.auth.login_invoke_arn
  logout_function_name          = module.auth.logout_function_name
  logout_invoke_arn             = module.auth.logout_invoke_arn
  document_upload_function_name = module.document_management.upload_function_name
  document_upload_invoke_arn    = module.document_management.upload_invoke_arn
  document_list_function_name   = module.document_management.list_function_name
  document_list_invoke_arn      = module.document_management.list_invoke_arn
  document_delete_function_name = module.document_management.delete_function_name
  document_delete_invoke_arn    = module.document_management.delete_invoke_arn
  chat_history_function_name    = module.chat_history.lambda_function_name
  chat_history_invoke_arn       = module.chat_history.lambda_invoke_arn
  cors_origin                   = module.frontend.frontend_url
}

module "opensearch_access_config" {
  source = "./modules/opensearch-access-config"

  environment                = var.environment
  opensearch_endpoint        = module.opensearch.endpoint
  master_user_password       = var.opensearch_master_user_password
  master_password_secret_arn = "" # Optional: ARN of Secrets Manager secret
  subnet_ids                 = module.networking.private_subnet_ids
  security_group_ids         = [module.security.lambda_security_group_id]
}

module "vector_store_init" {
  source = "./modules/vector-store-init"

  environment           = var.environment
  opensearch_endpoint   = module.opensearch.endpoint
  opensearch_domain_arn = module.opensearch.domain_arn
  subnet_ids            = module.networking.private_subnet_ids
  security_group_ids    = [module.security.lambda_security_group_id]
}

module "document_processor" {
  source = "./modules/document-processor"

  environment                     = var.environment
  documents_bucket_name           = module.storage.documents_bucket_name
  documents_bucket_arn            = module.storage.documents_bucket_arn
  document_metadata_table_name    = module.database.document_metadata_table_name
  document_metadata_table_arn     = module.database.document_metadata_table_arn
  kms_key_arn                     = module.security.kms_key_arn
  failed_processing_sns_topic_arn = module.notifications.failed_processing_topic_arn
  opensearch_endpoint             = module.opensearch.endpoint
  opensearch_index_name           = "documents"
  vpc_subnet_ids                  = module.networking.private_subnet_ids
  vpc_security_group_ids          = [module.security.lambda_security_group_id]
}

module "document_management" {
  source = "./modules/document-management"

  environment                  = var.environment
  document_metadata_table_name = module.database.document_metadata_table_name
  document_metadata_table_arn  = module.database.document_metadata_table_arn
  documents_bucket_name        = module.storage.documents_bucket_name
  documents_bucket_arn         = module.storage.documents_bucket_arn
  kms_key_arn                  = module.security.kms_key_arn
  opensearch_endpoint          = module.opensearch.endpoint
  opensearch_index             = "documents"
  opensearch_domain_arn        = module.opensearch.domain_arn
  private_subnet_ids           = module.networking.private_subnet_ids
  lambda_security_group_id     = module.security.lambda_security_group_id
  cors_origin                  = module.frontend.frontend_url
}

module "chat_history" {
  source = "./modules/chat-history"

  environment             = var.environment
  chat_history_table_name = module.database.chat_history_table_name
  chat_history_table_arn  = module.database.chat_history_table_arn
  kms_key_arn             = module.security.kms_key_arn
  kms_key_id              = module.security.kms_key_id
}

module "frontend" {
  source = "./modules/frontend"

  environment = var.environment
  account_id  = local.account_id
}
