# REST API Gateway for Chatbot

# REST API
resource "aws_api_gateway_rest_api" "chatbot" {
  name        = "${var.environment}-chatbot-api"
  description = "REST API for AWS Claude RAG Chatbot"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "${var.environment}-chatbot-api"
    Environment = var.environment
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${var.environment}-chatbot-api"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-api-logs"
    Environment = var.environment
  }
}

# Request/Response Models
resource "aws_api_gateway_model" "login_request" {
  rest_api_id  = aws_api_gateway_rest_api.chatbot.id
  name         = "LoginRequest"
  description  = "Login request model"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "LoginRequest"
    type      = "object"
    required  = ["username", "password"]
    properties = {
      username = {
        type = "string"
      }
      password = {
        type = "string"
      }
    }
  })
}

resource "aws_api_gateway_model" "login_response" {
  rest_api_id  = aws_api_gateway_rest_api.chatbot.id
  name         = "LoginResponse"
  description  = "Login response model"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "LoginResponse"
    type      = "object"
    required  = ["token", "expiresAt", "userId"]
    properties = {
      token = {
        type = "string"
      }
      expiresAt = {
        type = "number"
      }
      userId = {
        type = "string"
      }
    }
  })
}

resource "aws_api_gateway_model" "upload_request" {
  rest_api_id  = aws_api_gateway_rest_api.chatbot.id
  name         = "UploadRequest"
  description  = "Document upload request model"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "UploadRequest"
    type      = "object"
    required  = ["filename", "fileSize", "contentType"]
    properties = {
      filename = {
        type = "string"
      }
      fileSize = {
        type    = "number"
        maximum = 104857600
      }
      contentType = {
        type = "string"
        enum = ["application/pdf"]
      }
    }
  })
}

resource "aws_api_gateway_model" "upload_response" {
  rest_api_id  = aws_api_gateway_rest_api.chatbot.id
  name         = "UploadResponse"
  description  = "Document upload response model"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "UploadResponse"
    type      = "object"
    required  = ["uploadUrl", "documentId", "expiresAt"]
    properties = {
      uploadUrl = {
        type = "string"
      }
      documentId = {
        type = "string"
      }
      expiresAt = {
        type = "number"
      }
    }
  })
}

resource "aws_api_gateway_model" "error_response" {
  rest_api_id  = aws_api_gateway_rest_api.chatbot.id
  name         = "ErrorResponse"
  description  = "Error response model"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "ErrorResponse"
    type      = "object"
    required  = ["message"]
    properties = {
      message = {
        type = "string"
      }
      code = {
        type = "string"
      }
    }
  })
}

# Request Validators
resource "aws_api_gateway_request_validator" "body_validator" {
  name                        = "${var.environment}-body-validator"
  rest_api_id                 = aws_api_gateway_rest_api.chatbot.id
  validate_request_body       = true
  validate_request_parameters = false
}

resource "aws_api_gateway_request_validator" "params_validator" {
  name                        = "${var.environment}-params-validator"
  rest_api_id                 = aws_api_gateway_rest_api.chatbot.id
  validate_request_body       = false
  validate_request_parameters = true
}

resource "aws_api_gateway_request_validator" "all_validator" {
  name                        = "${var.environment}-all-validator"
  rest_api_id                 = aws_api_gateway_rest_api.chatbot.id
  validate_request_body       = true
  validate_request_parameters = true
}

# Lambda Authorizer
resource "aws_api_gateway_authorizer" "lambda" {
  name                             = "${var.environment}-lambda-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.chatbot.id
  authorizer_uri                   = var.authorizer_invoke_arn
  authorizer_credentials           = aws_iam_role.api_gateway_authorizer.arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 0 # Disable cache during development to avoid stale policies
}

# IAM Role for API Gateway to invoke Lambda Authorizer
resource "aws_iam_role" "api_gateway_authorizer" {
  name = "${var.environment}-api-gateway-authorizer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.environment}-api-gateway-authorizer-role"
  }
}

resource "aws_iam_role_policy" "api_gateway_authorizer" {
  name = "${var.environment}-api-gateway-authorizer-policy"
  role = aws_iam_role.api_gateway_authorizer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = var.authorizer_function_arn
      }
    ]
  })
}

# /auth Resource
resource "aws_api_gateway_resource" "auth" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_rest_api.chatbot.root_resource_id
  path_part   = "auth"
}

# /auth/login Resource
resource "aws_api_gateway_resource" "login" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "login"
}

# POST /auth/login Method
resource "aws_api_gateway_method" "login" {
  rest_api_id          = aws_api_gateway_rest_api.chatbot.id
  resource_id          = aws_api_gateway_resource.login.id
  http_method          = "POST"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.body_validator.id

  request_models = {
    "application/json" = aws_api_gateway_model.login_request.name
  }
}

# POST /auth/login Integration
resource "aws_api_gateway_integration" "login" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.login.id
  http_method             = aws_api_gateway_method.login.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.login_invoke_arn
}

# Lambda Permission for Login
resource "aws_lambda_permission" "login" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.login_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# /auth/logout Resource
resource "aws_api_gateway_resource" "logout" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "logout"
}

# POST /auth/logout Method
resource "aws_api_gateway_method" "logout" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.logout.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda.id
}

# POST /auth/logout Integration
resource "aws_api_gateway_integration" "logout" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.logout.id
  http_method             = aws_api_gateway_method.logout.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.logout_invoke_arn
}

# Lambda Permission for Logout
resource "aws_lambda_permission" "logout" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.logout_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# CORS Configuration for /auth/login
resource "aws_api_gateway_method" "login_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.login.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "login_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.login.id
  http_method = aws_api_gateway_method.login_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "login_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.login.id
  http_method = aws_api_gateway_method.login_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "login_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.login.id
  http_method = aws_api_gateway_method.login_options.http_method
  status_code = aws_api_gateway_method_response.login_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}

# CORS Configuration for /auth/logout
resource "aws_api_gateway_method" "logout_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.logout.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "logout_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.logout.id
  http_method = aws_api_gateway_method.logout_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "logout_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.logout.id
  http_method = aws_api_gateway_method.logout_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "logout_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.logout.id
  http_method = aws_api_gateway_method.logout_options.http_method
  status_code = aws_api_gateway_method_response.logout_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "chatbot" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id

  # Force new deployment when integration responses change
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration_response.login_options.id,
      aws_api_gateway_integration_response.logout_options.id,
      aws_api_gateway_integration_response.documents_options.id,
      aws_api_gateway_integration_response.documents_upload_options.id,
      aws_api_gateway_integration_response.documents_id_options.id,
      aws_api_gateway_integration_response.chat_history_options.id,
      var.cors_origin, # Force redeployment when CORS origin changes
    ]))
  }

  depends_on = [
    aws_api_gateway_integration.login,
    aws_api_gateway_integration.logout,
    aws_api_gateway_integration.login_options,
    aws_api_gateway_integration.logout_options,
    aws_api_gateway_integration.documents_list,
    aws_api_gateway_integration.documents_upload,
    aws_api_gateway_integration.documents_delete,
    aws_api_gateway_integration.documents_options,
    aws_api_gateway_integration.documents_upload_options,
    aws_api_gateway_integration.documents_id_options,
    aws_api_gateway_integration.chat_history,
    aws_api_gateway_integration.chat_history_options
  ]

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway Stage
resource "aws_api_gateway_stage" "chatbot" {
  deployment_id = aws_api_gateway_deployment.chatbot.id
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  stage_name    = var.environment

  # Access logs for audit trail (Requirement 11.1)
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      caller                  = "$context.identity.caller"
      user                    = "$context.identity.user"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      resourcePath            = "$context.resourcePath"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      integrationLatency      = "$context.integration.latency"
      responseLatency         = "$context.responseLatency"
      errorMessage            = "$context.error.message"
      errorMessageString      = "$context.error.messageString"
      authorizerError         = "$context.authorizer.error"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }

  tags = {
    Name        = "${var.environment}-chatbot-stage"
    Environment = var.environment
  }
}

# API Gateway Method Settings (Throttling and Logging)
resource "aws_api_gateway_method_settings" "chatbot" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  stage_name  = aws_api_gateway_stage.chatbot.stage_name
  method_path = "*/*"

  settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
    # Enable full request/response logging for audit trail (Requirement 11.1)
    logging_level      = "INFO"
    data_trace_enabled = true
    metrics_enabled    = true
  }

  depends_on = [aws_api_gateway_account.main]
}

# API Gateway CloudWatch Logs Role (Account-level setting)
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${var.environment}-api-gateway-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-api-gateway-cloudwatch-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

# AWS WAF Web ACL
resource "aws_wafv2_web_acl" "api_gateway" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.environment}-chatbot-api-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # IP Blocklist Rule (if configured)
  dynamic "rule" {
    for_each = length(var.waf_ip_blocklist) > 0 ? [1] : []
    content {
      name     = "IPBlocklistRule"
      priority = 0

      action {
        block {}
      }

      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.blocklist[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.environment}-ip-blocklist-rule"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rate-based rule to prevent abuse
  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-rate-limit-rule"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules - Core Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # Exclude rules that might cause false positives
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }

        rule_action_override {
          name = "GenericRFI_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-aws-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules - SQL Injection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-sqli-rules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.environment}-chatbot-api-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-api-waf"
    Environment = var.environment
  }
}

# IP Set for Blocklist
resource "aws_wafv2_ip_set" "blocklist" {
  count = var.enable_waf && length(var.waf_ip_blocklist) > 0 ? 1 : 0

  name               = "${var.environment}-ip-blocklist"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.waf_ip_blocklist

  tags = {
    Name        = "${var.environment}-ip-blocklist"
    Environment = var.environment
  }
}

# IP Set for Allowlist (optional - for future use)
resource "aws_wafv2_ip_set" "allowlist" {
  count = var.enable_waf && length(var.waf_ip_allowlist) > 0 ? 1 : 0

  name               = "${var.environment}-ip-allowlist"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.waf_ip_allowlist

  tags = {
    Name        = "${var.environment}-ip-allowlist"
    Environment = var.environment
  }
}

# Associate WAF with API Gateway Stage
resource "aws_wafv2_web_acl_association" "api_gateway" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_api_gateway_stage.chatbot.arn
  web_acl_arn  = aws_wafv2_web_acl.api_gateway[0].arn
}

# CloudWatch Log Group for WAF
resource "aws_cloudwatch_log_group" "waf_logs" {
  count = var.enable_waf ? 1 : 0

  name              = "aws-waf-logs-${var.environment}-chatbot-api"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-waf-logs"
    Environment = var.environment
  }
}

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "api_gateway" {
  count = var.enable_waf ? 1 : 0

  resource_arn            = aws_wafv2_web_acl.api_gateway[0].arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs[0].arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
}

# /documents Resource
resource "aws_api_gateway_resource" "documents" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_rest_api.chatbot.root_resource_id
  path_part   = "documents"
}

# GET /documents Method
resource "aws_api_gateway_method" "documents_list" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.documents.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda.id
}

# GET /documents Integration
resource "aws_api_gateway_integration" "documents_list" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.documents.id
  http_method             = aws_api_gateway_method.documents_list.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.document_list_invoke_arn
}

# Lambda Permission for Document List
resource "aws_lambda_permission" "document_list" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.document_list_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# POST /documents/upload Method
resource "aws_api_gateway_resource" "documents_upload" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.documents.id
  path_part   = "upload"
}

resource "aws_api_gateway_method" "documents_upload" {
  rest_api_id          = aws_api_gateway_rest_api.chatbot.id
  resource_id          = aws_api_gateway_resource.documents_upload.id
  http_method          = "POST"
  authorization        = "CUSTOM"
  authorizer_id        = aws_api_gateway_authorizer.lambda.id
  request_validator_id = aws_api_gateway_request_validator.body_validator.id

  request_models = {
    "application/json" = aws_api_gateway_model.upload_request.name
  }
}

# POST /documents/upload Integration
resource "aws_api_gateway_integration" "documents_upload" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.documents_upload.id
  http_method             = aws_api_gateway_method.documents_upload.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.document_upload_invoke_arn
}

# Lambda Permission for Document Upload
resource "aws_lambda_permission" "document_upload" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.document_upload_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# CORS Configuration for /documents
resource "aws_api_gateway_method" "documents_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.documents.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "documents_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents.id
  http_method = aws_api_gateway_method.documents_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "documents_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents.id
  http_method = aws_api_gateway_method.documents_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "documents_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents.id
  http_method = aws_api_gateway_method.documents_options.http_method
  status_code = aws_api_gateway_method_response.documents_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}

# CORS Configuration for /documents/upload
resource "aws_api_gateway_method" "documents_upload_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.documents_upload.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "documents_upload_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_upload.id
  http_method = aws_api_gateway_method.documents_upload_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "documents_upload_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_upload.id
  http_method = aws_api_gateway_method.documents_upload_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "documents_upload_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_upload.id
  http_method = aws_api_gateway_method.documents_upload_options.http_method
  status_code = aws_api_gateway_method_response.documents_upload_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}

# /documents/{documentId} Resource
resource "aws_api_gateway_resource" "documents_id" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.documents.id
  path_part   = "{documentId}"
}

# DELETE /documents/{documentId} Method
resource "aws_api_gateway_method" "documents_delete" {
  rest_api_id          = aws_api_gateway_rest_api.chatbot.id
  resource_id          = aws_api_gateway_resource.documents_id.id
  http_method          = "DELETE"
  authorization        = "CUSTOM"
  authorizer_id        = aws_api_gateway_authorizer.lambda.id
  request_validator_id = aws_api_gateway_request_validator.params_validator.id

  request_parameters = {
    "method.request.path.documentId" = true
  }
}

# DELETE /documents/{documentId} Integration
resource "aws_api_gateway_integration" "documents_delete" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.documents_id.id
  http_method             = aws_api_gateway_method.documents_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.document_delete_invoke_arn
}

# Lambda Permission for Document Delete
resource "aws_lambda_permission" "document_delete" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.document_delete_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# CORS Configuration for /documents/{documentId}
resource "aws_api_gateway_method" "documents_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.documents_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "documents_id_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_id.id
  http_method = aws_api_gateway_method.documents_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "documents_id_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_id.id
  http_method = aws_api_gateway_method.documents_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "documents_id_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.documents_id.id
  http_method = aws_api_gateway_method.documents_id_options.http_method
  status_code = aws_api_gateway_method_response.documents_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}

# /chat Resource
resource "aws_api_gateway_resource" "chat" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_rest_api.chatbot.root_resource_id
  path_part   = "chat"
}

# /chat/history Resource
resource "aws_api_gateway_resource" "chat_history" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  parent_id   = aws_api_gateway_resource.chat.id
  path_part   = "history"
}

# GET /chat/history Method
resource "aws_api_gateway_method" "chat_history" {
  rest_api_id          = aws_api_gateway_rest_api.chatbot.id
  resource_id          = aws_api_gateway_resource.chat_history.id
  http_method          = "GET"
  authorization        = "CUSTOM"
  authorizer_id        = aws_api_gateway_authorizer.lambda.id
  request_validator_id = aws_api_gateway_request_validator.params_validator.id

  request_parameters = {
    "method.request.querystring.sessionId" = true
    "method.request.querystring.limit"     = false
    "method.request.querystring.nextToken" = false
  }
}

# GET /chat/history Integration
resource "aws_api_gateway_integration" "chat_history" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot.id
  resource_id             = aws_api_gateway_resource.chat_history.id
  http_method             = aws_api_gateway_method.chat_history.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.chat_history_invoke_arn
}

# Lambda Permission for Chat History
resource "aws_lambda_permission" "chat_history" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.chat_history_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.chatbot.execution_arn}/*/*"
}

# CORS Configuration for /chat/history
resource "aws_api_gateway_method" "chat_history_options" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot.id
  resource_id   = aws_api_gateway_resource.chat_history.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration_response" "chat_history_options" {
  rest_api_id = aws_api_gateway_rest_api.chatbot.id
  resource_id = aws_api_gateway_resource.chat_history.id
  http_method = aws_api_gateway_method.chat_history_options.http_method
  status_code = aws_api_gateway_method_response.chat_history_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods"     = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"      = "'${var.cors_origin}'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
  }
}
