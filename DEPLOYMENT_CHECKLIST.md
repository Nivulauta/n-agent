# Deployment Checklist - Claude Haiku 4.5 Updates

## Summary of Changes

The following code changes have been made to fix Bedrock model configuration and related issues:

1. **Bedrock Service** (`lambda/shared/bedrock/src/bedrock.ts`)
   - Updated to use Claude Haiku 4.5 inference profile: `global.anthropic.claude-haiku-4-5-20251001-v1:0`
   - Fixed parameter conflict: removed `top_p` default, only use `temperature` (0.7)
   - Only include `top_p` if explicitly provided in request

2. **WebSocket Message Handler** (`lambda/websocket/message/src/index.ts`)
   - Removed `topP: 0.9` from Bedrock call (only using `temperature: 0.7`)
   - Added empty message filtering in conversation history (multiple places)
   - Added validation to ensure finalPrompt is never empty

3. **OpenSearch Client** (`lambda/shared/vector-store/src/opensearch-client.ts`)
   - Fixed k-NN query structure to use correct format: `{ query: { knn: { embedding: { vector: [...], k: N } } } }`

4. **IAM Permissions** (`terraform/modules/websocket-handlers/main.tf`)
   - Already includes inference profile permissions: `arn:aws:bedrock:*:*:inference-profile/*`

5. **Documentation Updates**
   - Updated README.md with Claude Haiku 4.5 references
   - Updated design.md with Claude Haiku 4.5 references
   - Updated bedrock module README and package.json

## Deployment Steps

### Step 1: Rebuild Lambda Functions

```bash
# Rebuild shared bedrock module
cd lambda/shared/bedrock
npm run build

# Rebuild websocket message Lambda
cd ../../websocket/message
node build.mjs

# Return to root
cd ../../..
```

### Step 2: Deploy via Terraform

```bash
cd terraform
terraform apply
```

Review the changes and type `yes` to confirm deployment.

### Step 3: Configure OpenSearch Access

The websocket message Lambda role needs to be mapped to OpenSearch for search permissions.

**Option A: Manual Invocation (Quick)**

```bash
aws lambda invoke \
  --function-name dev-opensearch-configure-access \
  --payload '{"lambdaRoleArn":"arn:aws:iam::177981160483:role/dev-websocket-message-role"}' \
  response.json

cat response.json
```

**Option B: Terraform Automation (Recommended for Production)**

Add to `terraform/modules/opensearch-access-config/main.tf`:

```hcl
# Automatically configure access for websocket message Lambda
resource "null_resource" "configure_websocket_access" {
  depends_on = [aws_lambda_function.configure_access]

  triggers = {
    lambda_role_arn = var.websocket_message_role_arn
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws lambda invoke \
        --function-name ${aws_lambda_function.configure_access.function_name} \
        --payload '{"lambdaRoleArn":"${var.websocket_message_role_arn}"}' \
        response.json
    EOT
  }
}
```

### Step 4: Test the Deployment

1. Connect to WebSocket API
2. Send a test message
3. Verify:
   - No "model identifier is invalid" errors
   - No "temperature and top_p cannot both be specified" errors
   - No "expecting START_ARRAY but got VALUE_STRING" errors
   - No "no permissions for [indices:data/read/search]" errors
   - No "messages.X.content: Field required" errors
   - Response streams correctly from Claude Haiku 4.5

### Step 5: Monitor CloudWatch Logs

```bash
# Watch websocket message Lambda logs
aws logs tail /aws/lambda/dev-websocket-message --follow

# Watch for any errors
aws logs filter-pattern /aws/lambda/dev-websocket-message --filter-pattern "ERROR"
```

## Expected Behavior After Deployment

- Model: Claude Haiku 4.5 via global inference profile
- Parameters: Only `temperature: 0.7` (no `top_p`)
- OpenSearch: k-NN queries work correctly with proper structure
- Permissions: Websocket Lambda can search OpenSearch
- Messages: Empty messages filtered out before sending to Claude
- Streaming: Response chunks delivered in real-time via WebSocket

## Rollback Plan

If issues occur:

```bash
cd terraform
terraform apply -target=module.websocket_handlers.aws_lambda_function.message
```

Or revert code changes and redeploy.

## Known Issues Resolved

1. ✅ Invalid model ID errors
2. ✅ Temperature/top_p parameter conflict
3. ✅ OpenSearch k-NN query structure
4. ✅ IAM permissions for inference profiles
5. ✅ Empty message validation errors
6. ⏳ OpenSearch access mapping (needs Step 3)

## Next Steps After Deployment

1. Test with various query types (simple, RAG-requiring)
2. Verify conversation history works correctly
3. Test document upload and embedding generation
4. Monitor costs and performance metrics
5. Set up CloudWatch alarms for errors
