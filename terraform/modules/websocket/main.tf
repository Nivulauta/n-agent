# WebSocket API Gateway
resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${var.environment}-chatbot-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = {
    Name        = "${var.environment}-chatbot-websocket"
    Environment = var.environment
  }
}

# WebSocket Stage
resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.environment
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.websocket_logs.arn
    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }

  tags = {
    Name        = "${var.environment}-websocket-stage"
    Environment = var.environment
  }
}

# CloudWatch Log Group for WebSocket API
resource "aws_cloudwatch_log_group" "websocket_logs" {
  name              = "/aws/apigateway/${var.environment}-websocket"
  retention_in_days = 365

  tags = {
    Name        = "${var.environment}-websocket-logs"
    Environment = var.environment
  }
}

# Lambda Authorizer for WebSocket
resource "aws_apigatewayv2_authorizer" "websocket" {
  api_id           = aws_apigatewayv2_api.websocket.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = var.authorizer_invoke_arn
  identity_sources = ["route.request.querystring.token"]
  name             = "${var.environment}-websocket-authorizer"
}

# Lambda Permission for Authorizer
resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*"
}

# $connect Route Integration
resource "aws_apigatewayv2_integration" "connect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri    = var.connect_handler_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "$connect"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.websocket.id
  target             = "integrations/${aws_apigatewayv2_integration.connect.id}"
}

resource "aws_lambda_permission" "connect" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.connect_handler_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/$connect"
}

# $disconnect Route Integration
resource "aws_apigatewayv2_integration" "disconnect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri    = var.disconnect_handler_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}

resource "aws_lambda_permission" "disconnect" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.disconnect_handler_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/$disconnect"
}

# chat_message Route Integration
resource "aws_apigatewayv2_integration" "message" {
  api_id             = aws_apigatewayv2_api.websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri    = var.message_handler_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "message" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "chat_message"
  target    = "integrations/${aws_apigatewayv2_integration.message.id}"
}

resource "aws_lambda_permission" "message" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.message_handler_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/chat_message"
}
