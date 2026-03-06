# CloudWatch Log Group Mapping

## Issue
The monitoring module creates log groups with generic names that don't match the actual Lambda function names. Each Lambda module creates its own log groups with the correct naming.

## Actual Log Group Locations

### Authentication Lambdas
- **Authorizer**: `/aws/lambda/${environment}-api-authorizer`
- **Login**: `/aws/lambda/${environment}-auth-login`
- **Logout**: `/aws/lambda/${environment}-auth-logout`

### WebSocket Lambdas
- **Connect**: `/aws/lambda/${environment}-websocket-connect`
- **Disconnect**: `/aws/lambda/${environment}-websocket-disconnect`
- **Message (Chat Handler)**: `/aws/lambda/${environment}-websocket-message`

### Document Management Lambdas
- **Upload Handler**: `/aws/lambda/${environment}-document-upload`
- **List Handler**: `/aws/lambda/${environment}-document-list`
- **Delete Handler**: `/aws/lambda/${environment}-document-delete`

### Document Processing Lambdas
- **Document Processor**: `/aws/lambda/${environment}-chatbot-document-processor`
- **Embedding Generator**: `/aws/lambda/${environment}-chatbot-generate-embeddings`

### Chat History Lambda
- **Chat History**: `/aws/lambda/${environment}-chatbot-chat-history`

## Orphaned Log Groups (Not Used)
These log groups in the monitoring module are NOT being used:
- `/aws/lambda/${environment}-chatbot-auth` ❌
- `/aws/lambda/${environment}-chatbot-chat` ❌
- `/aws/lambda/${environment}-chatbot-websocket` ❌
- `/aws/chatbot/${environment}/application` ❌
- `/aws/apigateway/${environment}-chatbot` ❌

## Actual API Gateway Log Groups
- **REST API**: `/aws/apigateway/${environment}-chatbot-api` (created by rest-api module)
- **WebSocket API**: `/aws/apigateway/${environment}-websocket` (created by websocket module)

## Recommendation
Remove the orphaned log groups from the monitoring module since each module creates its own log group with the correct name. The `application_logs` group was never referenced by any code. The `api_gateway` log group was duplicated - the rest-api module creates its own with a different name.

## Where to Find Your Logs

If you're looking for:
- **Auth logs**: Check `/aws/lambda/${environment}-auth-login` and `/aws/lambda/${environment}-auth-logout`
- **Chat logs**: Check `/aws/lambda/${environment}-websocket-message` (this is the main chat handler)
- **WebSocket logs**: Check `/aws/lambda/${environment}-websocket-connect`, `-disconnect`, and `-message`
