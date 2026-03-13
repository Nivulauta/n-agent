# Force API Gateway Redeployment

## Problem
The API Gateway OPTIONS responses are still showing `Access-Control-Allow-Origin: *` even after Terraform apply. This happens because API Gateway doesn't automatically redeploy when integration responses change.

## Solution 1: Terraform with Triggers (Recommended)

I've added a `triggers` block to the deployment resource that will force redeployment when integration responses change.

Run:
```bash
cd terraform
terraform apply
```

This will now force a new deployment.

## Solution 2: Manual Redeploy via AWS Console

If Terraform still doesn't trigger redeployment:

1. Go to AWS Console → API Gateway
2. Select your API (`dev-chatbot-api`)
3. Click "Resources" in left menu
4. Click "Actions" dropdown → "Deploy API"
5. Select Stage: `dev`
6. Click "Deploy"

## Solution 3: Taint the Deployment Resource

Force Terraform to recreate the deployment:

```bash
cd terraform
terraform taint module.rest_api.aws_api_gateway_deployment.chatbot
terraform apply
```

## Solution 4: AWS CLI

Redeploy via CLI:

```bash
# Get the REST API ID
aws apigateway get-rest-apis --query "items[?name=='dev-chatbot-api'].id" --output text

# Create new deployment (replace REST_API_ID)
aws apigateway create-deployment \
  --rest-api-id REST_API_ID \
  --stage-name dev \
  --description "CORS fix deployment"
```

## Verification

After redeployment, test:

```bash
curl -i -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  https://gv1ucj9hg9.execute-api.us-east-2.amazonaws.com/dev/auth/login
```

Should return:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

NOT:
```
Access-Control-Allow-Origin: *
```

## Why This Happens

API Gateway caches deployments. When you change integration responses in Terraform, it updates the configuration but doesn't automatically create a new deployment. The `triggers` block I added will detect changes and force redeployment.

## Next Steps

1. Run `terraform apply` again with the new triggers
2. If still not working, use Solution 2 (manual console deploy)
3. Clear browser cache after redeployment
4. Test login again
