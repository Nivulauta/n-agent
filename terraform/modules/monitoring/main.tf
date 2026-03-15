# Note: API Gateway log groups are created in their respective modules
# - REST API module creates: /aws/apigateway/${environment}-chatbot-api
# - WebSocket module creates: /aws/apigateway/${environment}-websocket

# Note: Lambda-specific log groups are created in their respective modules
# - Auth module creates: /aws/lambda/${environment}-auth-login, -logout, -api-authorizer
# - WebSocket handlers module creates: /aws/lambda/${environment}-websocket-connect, -disconnect, -message
# - Chat history module creates: /aws/lambda/${environment}-chatbot-chat-history
# - Document management module creates: /aws/lambda/${environment}-document-upload, -list, -delete

# CloudWatch Log Group for Lambda - Document Processor
resource "aws_cloudwatch_log_group" "lambda_document_processor" {
  name              = "/aws/lambda/${var.environment}-chatbot-document-processor"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-lambda-document-processor-logs"
    Environment = var.environment
  }
}

# CloudWatch Log Groups for Audit Logging
# Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5

# Audit Log Group - User Actions
resource "aws_cloudwatch_log_group" "audit_user_actions" {
  name              = "/aws/lambda/chatbot/audit/user-actions"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-audit-user-actions"
    Environment = var.environment
    LogType     = "audit"
    Category    = "user-actions"
  }
}

# Audit Log Group - API Calls
resource "aws_cloudwatch_log_group" "audit_api_calls" {
  name              = "/aws/lambda/chatbot/audit/api-calls"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-audit-api-calls"
    Environment = var.environment
    LogType     = "audit"
    Category    = "api-calls"
  }
}

# Audit Log Group - Document Operations
resource "aws_cloudwatch_log_group" "audit_document_operations" {
  name              = "/aws/lambda/chatbot/audit/document-operations"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-chatbot-audit-document-operations"
    Environment = var.environment
    LogType     = "audit"
    Category    = "document-operations"
  }
}

# Note: Application logs are written to Lambda-specific log groups
# Each Lambda function creates its own log group automatically
# No separate application_logs group is needed

# CloudWatch Metric Alarm - Lambda Errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.environment}-chatbot-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This metric monitors Lambda function errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${var.environment}-chatbot-*"
  }

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-lambda-errors-alarm"
    Environment = var.environment
  }
}

# CloudWatch Metric Alarm - API Gateway 5XX Errors
resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  alarm_name          = "${var.environment}-chatbot-api-gateway-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This metric monitors API Gateway 5XX errors"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-api-gateway-5xx-alarm"
    Environment = var.environment
  }
}

# CloudWatch Metric Alarm - High Response Time
# Validates: Requirements 15.5
resource "aws_cloudwatch_metric_alarm" "high_latency" {
  alarm_name          = "${var.environment}-chatbot-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 2000
  alarm_description   = "This metric monitors Lambda function duration exceeding 2 seconds"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${var.environment}-websocket-message"
  }

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-high-latency-alarm"
    Environment = var.environment
  }
}

# CloudWatch Metric Alarm - Response Time > 2 seconds
# Validates: Requirements 15.5
resource "aws_cloudwatch_metric_alarm" "response_time_threshold" {
  alarm_name          = "${var.environment}-chatbot-response-time-exceeded"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "query_latency"
  namespace           = "ChatbotMetrics"
  period              = 60
  statistic           = "Average"
  threshold           = 2000
  alarm_description   = "Alert when average query response time exceeds 2 seconds over 3 consecutive periods"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-response-time-alarm"
    Environment = var.environment
    Requirement = "15.5"
  }
}

# CloudWatch Metric Alarm - Error Rate > 5%
# Validates: Requirements 15.5
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "${var.environment}-chatbot-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2

  # Calculate error rate as percentage
  metric_query {
    id          = "error_rate"
    expression  = "(errors / invocations) * 100"
    label       = "Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "invocations"
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
    }
  }

  threshold          = 5
  alarm_description  = "Alert when Lambda error rate exceeds 5% over 2 consecutive periods"
  treat_missing_data = "notBreaching"

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-error-rate-alarm"
    Environment = var.environment
    Requirement = "15.5"
  }
}

# CloudWatch Metric Alarm - Bedrock Throttling Errors
# Validates: Requirements 15.5
resource "aws_cloudwatch_metric_alarm" "bedrock_throttling" {
  alarm_name          = "${var.environment}-chatbot-bedrock-throttling"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BedrockThrottlingErrors"
  namespace           = "ChatbotMetrics"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Alert when Bedrock API throttling errors occur (more than 5 in 1 minute)"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-bedrock-throttling-alarm"
    Environment = var.environment
    Requirement = "15.5"
  }
}

# CloudWatch Metric Alarm - API Gateway Error Rate > 5%
# Validates: Requirements 15.5
resource "aws_cloudwatch_metric_alarm" "api_gateway_error_rate" {
  alarm_name          = "${var.environment}-chatbot-api-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2

  # Calculate API Gateway error rate as percentage
  metric_query {
    id          = "api_error_rate"
    expression  = "((m1 + m2) / m3) * 100"
    label       = "API Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "m1"
    metric {
      metric_name = "5XXError"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "m2"
    metric {
      metric_name = "4XXError"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "m3"
    metric {
      metric_name = "Count"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
    }
  }

  threshold          = 5
  alarm_description  = "Alert when API Gateway error rate exceeds 5% over 2 consecutive periods"
  treat_missing_data = "notBreaching"

  alarm_actions = var.system_alerts_topic_arn != "" ? [var.system_alerts_topic_arn] : []

  tags = {
    Name        = "${var.environment}-chatbot-api-error-rate-alarm"
    Environment = var.environment
    Requirement = "15.5"
  }
}

# CloudWatch Dashboard - System Monitoring
# Validates: Requirements 15.4
resource "aws_cloudwatch_dashboard" "system_monitoring" {
  dashboard_name = "${var.environment}-chatbot-system-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      # Request Rate
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Count", { stat = "Sum", label = "REST API Requests" }],
            ["AWS/ApiGateway", "Count", { stat = "Sum", label = "WebSocket Messages" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Request Rate"
          yAxis = {
            left = {
              label = "Requests"
            }
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 0
      },

      # Error Rate
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApiGateway", "5XXError", { stat = "Sum", label = "5XX Errors", color = "#d62728" }],
            ["AWS/ApiGateway", "4XXError", { stat = "Sum", label = "4XX Errors", color = "#ff7f0e" }],
            ["AWS/Lambda", "Errors", { stat = "Sum", label = "Lambda Errors", color = "#e377c2" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Error Rate"
          yAxis = {
            left = {
              label = "Errors"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 0
      },

      # Latency Percentiles (p50, p95, p99)
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Duration", { stat = "p50", label = "p50 Latency" }],
            ["AWS/Lambda", "Duration", { stat = "p95", label = "p95 Latency" }],
            ["AWS/Lambda", "Duration", { stat = "p99", label = "p99 Latency" }]
          ]
          period = 300
          region = var.aws_region
          title  = "Response Latency Percentiles"
          yAxis = {
            left = {
              label = "Milliseconds"
            }
          }
          annotations = {
            horizontal = [
              {
                label = "2s SLA Threshold"
                value = 2000
                color = "#d62728"
              }
            ]
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 6
      },

      # Bedrock Token Usage (by Model)
      {
        type = "metric"
        properties = {
          metrics = [
            ["ChatbotMetrics", "BedrockInputTokens", "Model", "claude-haiku-4.5", { stat = "Sum", label = "Input Tokens (Haiku 4.5)" }],
            ["ChatbotMetrics", "BedrockOutputTokens", "Model", "claude-haiku-4.5", { stat = "Sum", label = "Output Tokens (Haiku 4.5)" }],
            ["ChatbotMetrics", "BedrockTotalTokens", "Model", "claude-haiku-4.5", { stat = "Sum", label = "Total Tokens (Haiku 4.5)" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Bedrock Token Usage by Model"
          yAxis = {
            left = {
              label = "Tokens"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 6
      },

      # Bedrock Token Usage (by User)
      {
        type = "metric"
        properties = {
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["ChatbotMetrics", "BedrockTotalTokens", { stat = "Sum", label = "Total Tokens (All Users)" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Bedrock Token Usage by User"
          yAxis = {
            left = {
              label = "Tokens"
            }
          }
          setPeriodToTimeRange = true
        }
        width  = 12
        height = 6
        x      = 0
        y      = 12
      },

      # Bedrock Cost Estimates
      {
        type = "metric"
        properties = {
          metrics = [
            [
              {
                expression = "(m1 * 0.00025 + m2 * 0.00125) / 1000"
                label      = "Estimated Cost (USD)"
                id         = "e1"
              }
            ],
            ["ChatbotMetrics", "BedrockInputTokens", "Model", "claude-haiku-4.5", { id = "m1", visible = false }],
            ["ChatbotMetrics", "BedrockOutputTokens", "Model", "claude-haiku-4.5", { id = "m2", visible = false }]
          ]
          period = 3600
          region = var.aws_region
          title  = "Bedrock Cost Estimates (Hourly)"
          yAxis = {
            left = {
              label = "USD"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 12
      },

      # Cache Hit Rate
      {
        type = "metric"
        properties = {
          metrics = [
            [
              {
                expression = "(m1 / (m1 + m2)) * 100"
                label      = "Cache Hit Rate (%)"
                id         = "e1"
              }
            ],
            ["ChatbotMetrics", "CacheHits", { id = "m1", visible = false }],
            ["ChatbotMetrics", "CacheMisses", { id = "m2", visible = false }]
          ]
          period = 300
          region = var.aws_region
          title  = "Cache Hit Rate"
          yAxis = {
            left = {
              label = "Percentage"
              min   = 0
              max   = 100
            }
          }
          annotations = {
            horizontal = [
              {
                label = "30% Target"
                value = 30
                color = "#2ca02c"
              }
            ]
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 18
      },

      # Concurrent User Count
      {
        type = "metric"
        properties = {
          metrics = [
            ["ChatbotMetrics", "ConcurrentConnections", { stat = "Average", label = "Active WebSocket Connections" }],
            ["AWS/Lambda", "ConcurrentExecutions", { stat = "Maximum", label = "Lambda Concurrent Executions" }]
          ]
          period = 60
          region = var.aws_region
          title  = "Concurrent User Count"
          yAxis = {
            left = {
              label = "Count"
            }
          }
          annotations = {
            horizontal = [
              {
                label = "100 User Target"
                value = 100
                color = "#2ca02c"
              }
            ]
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 18
      },

      # OpenSearch Query Latency
      {
        type = "metric"
        properties = {
          metrics = [
            ["ChatbotMetrics", "OpenSearchQueryLatency", { stat = "Average", label = "Average Latency" }],
            ["ChatbotMetrics", "OpenSearchQueryLatency", { stat = "p95", label = "p95 Latency" }],
            ["ChatbotMetrics", "OpenSearchQueryLatency", { stat = "p99", label = "p99 Latency" }]
          ]
          period = 300
          region = var.aws_region
          title  = "OpenSearch Query Latency"
          yAxis = {
            left = {
              label = "Milliseconds"
            }
          }
          annotations = {
            horizontal = [
              {
                label = "200ms Target"
                value = 200
                color = "#d62728"
              }
            ]
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 24
      },

      # Lambda Invocations by Function
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", { stat = "Sum", label = "WebSocket Message Handler" }],
            ["AWS/Lambda", "Invocations", { stat = "Sum", label = "Document Processor" }],
            ["AWS/Lambda", "Invocations", { stat = "Sum", label = "Auth Functions" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Lambda Invocations by Function"
          yAxis = {
            left = {
              label = "Invocations"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 24
      },

      # DynamoDB Operations
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", { stat = "Sum", label = "Read Capacity" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", { stat = "Sum", label = "Write Capacity" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB Capacity Usage"
          yAxis = {
            left = {
              label = "Units"
            }
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 30
      },

      # S3 Storage Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/S3", "BucketSizeBytes", { stat = "Average", label = "Storage Used" }],
            ["AWS/S3", "NumberOfObjects", { stat = "Average", label = "Object Count" }]
          ]
          period = 86400
          region = var.aws_region
          title  = "S3 Document Storage"
          yAxis = {
            left = {
              label = "Bytes / Count"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 30
      },

      # ElastiCache Redis Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CacheHits", { stat = "Sum", label = "Cache Hits" }],
            ["AWS/ElastiCache", "CacheMisses", { stat = "Sum", label = "Cache Misses" }],
            ["AWS/ElastiCache", "CPUUtilization", { stat = "Average", label = "CPU Utilization (%)" }]
          ]
          period = 300
          region = var.aws_region
          title  = "ElastiCache Redis Performance"
          yAxis = {
            left = {
              label = "Count / Percentage"
            }
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 36
      }
    ]
  })

  depends_on = [
    aws_cloudwatch_log_group.audit_user_actions,
    aws_cloudwatch_log_group.audit_api_calls,
    aws_cloudwatch_log_group.audit_document_operations
  ]
}
