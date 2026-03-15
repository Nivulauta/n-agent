# Sessions Table
resource "aws_dynamodb_table" "sessions" {
  name         = "${var.environment}-chatbot-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "N"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-sessions"
    Environment = var.environment
  }
}

# Chat History Table
resource "aws_dynamodb_table" "chat_history" {
  name         = "${var.environment}-chatbot-chat-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "N"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-chat-history"
    Environment = var.environment
  }
}

# Rate Limits Table
resource "aws_dynamodb_table" "rate_limits" {
  name         = "${var.environment}-chatbot-rate-limits"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-rate-limits"
    Environment = var.environment
  }
}

# Document Metadata Table
resource "aws_dynamodb_table" "document_metadata" {
  name         = "${var.environment}-chatbot-document-metadata"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "uploadedBy"
    type = "S"
  }

  attribute {
    name = "uploadedAt"
    type = "N"
  }

  global_secondary_index {
    name            = "uploadedBy-index"
    hash_key        = "uploadedBy"
    range_key       = "uploadedAt"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-document-metadata"
    Environment = var.environment
  }
}

# Users Table
resource "aws_dynamodb_table" "users" {
  name         = "${var.environment}-chatbot-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-users"
    Environment = var.environment
  }
}

# WebSocket Connections Table
resource "aws_dynamodb_table" "connections" {
  name         = "${var.environment}-chatbot-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    range_key       = "SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-connections"
    Environment = var.environment
  }
}


# MCP Server Config Table
resource "aws_dynamodb_table" "mcp_server_config" {
  name         = "${var.environment}-chatbot-mcp-server-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.environment}-chatbot-mcp-server-config"
    Environment = var.environment
  }
}

# Seed MCP server configs on deployment

resource "aws_dynamodb_table_item" "mcp_seed_serpapi" {
  table_name = aws_dynamodb_table.mcp_server_config.name
  hash_key   = aws_dynamodb_table.mcp_server_config.hash_key
  range_key  = aws_dynamodb_table.mcp_server_config.range_key

  item = jsonencode({
    PK          = { S = "MCP#serpapi" }
    SK          = { S = "CONFIG" }
    name        = { S = "serpapi" }
    transport   = { S = "streamable-http" }
    url         = { S = var.serpapi_mcp_url }
    enabled     = { BOOL = true }
    builtin     = { BOOL = false }
    description = { S = "SerpAPI web search tools via MCP" }
    toolArgHints = { M = {
      defaults = { M = {
        engine = { S = "google_light" }
        mode   = { S = "complete" }
      } }
      paramDescriptions = { M = {
        q        = { S = "Search query (required for most engines)" }
        engine   = { S = "Search engine to use (default: google_light)" }
        location = { S = "Geographic location filter" }
        num      = { S = "Number of results to return" }
        mode     = { S = "Response mode: complete (full JSON) or compact (metadata removed)" }
      } }
    } }
  })

  lifecycle {
    ignore_changes = [item]
  }
}
