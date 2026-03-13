# Deployment Checklist - Vector Store Init Index

Use this checklist to ensure a successful deployment of the vector store init index Lambda function.

## Pre-Deployment Checklist

### Prerequisites
- [ ] AWS CLI installed and configured
- [ ] Terraform >= 1.0 installed
- [ ] Node.js and npm installed
- [ ] AWS credentials configured with appropriate permissions
- [ ] OpenSearch cluster deployed and accessible
- [ ] VPC and networking configured

### Infrastructure Dependencies
- [ ] `module.networking` deployed (VPC, subnets)
- [ ] `module.opensearch` deployed (OpenSearch cluster)
- [ ] `module.security` deployed (security groups, IAM roles)
- [ ] OpenSearch cluster is healthy and accessible

### Permissions Verification
- [ ] AWS credentials have Lambda create/update permissions
- [ ] AWS credentials have IAM role create/update permissions
- [ ] AWS credentials have CloudWatch Logs permissions
- [ ] Lambda execution role will have OpenSearch permissions

## Build Checklist

### Lambda Function Build
- [ ] Navigate to `lambda/vector-store/init-index`
- [ ] Run `npm install` successfully
- [ ] Run `npm run build` successfully
- [ ] Verify `dist/` directory exists
- [ ] Verify `dist/index.js` exists
- [ ] Run `npm test` - all tests pass
- [ ] Run `bash build-for-terraform.sh` successfully
- [ ] Verify `dist/node_modules/` exists

### Build Verification
```bash
cd lambda/vector-store/init-index
[ -f dist/index.js ] && echo "✓ index.js exists" || echo "✗ index.js missing"
[ -d dist/node_modules ] && echo "✓ node_modules exists" || echo "✗ node_modules missing"
```

## Terraform Deployment Checklist

### Pre-Apply
- [ ] Navigate to `terraform/` directory
- [ ] Run `terraform init` successfully
- [ ] Run `terraform validate` - no errors
- [ ] Run `terraform plan` - review changes
- [ ] Verify module `vector_store_init` is in plan
- [ ] Verify Lambda function will be created
- [ ] Verify IAM role will be created
- [ ] Verify CloudWatch log group will be created

### Apply
- [ ] Run `terraform apply`
- [ ] Review and approve changes
- [ ] Wait for apply to complete successfully
- [ ] No errors in Terraform output

### Post-Apply Verification
- [ ] Run `terraform output vector_store_init_function_name`
- [ ] Run `terraform output vector_store_init_function_arn`
- [ ] Verify outputs are not empty

### AWS Console Verification
- [ ] Lambda function exists in AWS Console
- [ ] Function name: `<environment>-vector-store-init-index`
- [ ] Runtime: Node.js 22.x
- [ ] Memory: 512 MB
- [ ] Timeout: 60 seconds
- [ ] VPC configuration present
- [ ] Environment variables set (OPENSEARCH_ENDPOINT, AWS_REGION)
- [ ] IAM role attached
- [ ] CloudWatch log group exists

## Lambda Invocation Checklist

### Prepare Invocation
- [ ] Get function name from Terraform output
- [ ] Verify AWS CLI is configured
- [ ] Verify AWS credentials are valid

### Invoke Function
```bash
FUNCTION_NAME=$(terraform output -raw vector_store_init_function_name)
aws lambda invoke --function-name $FUNCTION_NAME --payload '{}' response.json
```

- [ ] Command executes without errors
- [ ] `response.json` file created
- [ ] Response contains `statusCode: 200`
- [ ] Response contains success message

### Expected Response
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

### CloudWatch Logs Verification
- [ ] Navigate to CloudWatch Logs in AWS Console
- [ ] Find log group: `/aws/lambda/<environment>-vector-store-init-index`
- [ ] Latest log stream exists
- [ ] No error messages in logs
- [ ] Success message present in logs

## Index Verification Checklist

### OpenSearch Index Verification
- [ ] Get OpenSearch endpoint from Terraform output
- [ ] Access OpenSearch Dashboards (if available)
- [ ] Navigate to Dev Tools console
- [ ] Run: `GET /documents`
- [ ] Index exists and returns mapping

### Expected Index Configuration
- [ ] Index name: `documents`
- [ ] Field `embedding` exists
- [ ] Field `embedding` type: `knn_vector`
- [ ] Field `embedding` dimension: 1024
- [ ] Field `embedding` method: `hnsw`
- [ ] Field `embedding` space_type: `cosinesimil`
- [ ] HNSW ef_construction: 512
- [ ] HNSW m: 16
- [ ] Index setting knn: true
- [ ] Index setting ef_search: 512
- [ ] Index setting refresh_interval: 5s

### Metadata Fields Verification
- [ ] Field `chunkId` exists (type: keyword)
- [ ] Field `documentId` exists (type: keyword)
- [ ] Field `documentName` exists (type: text)
- [ ] Field `pageNumber` exists (type: integer)
- [ ] Field `chunkIndex` exists (type: integer)
- [ ] Field `text` exists (type: text)
- [ ] Field `uploadedAt` exists (type: date)
- [ ] Field `uploadedBy` exists (type: keyword)

## Troubleshooting Checklist

### If Build Fails
- [ ] Check Node.js version (should be >= 22)
- [ ] Check npm version
- [ ] Delete `node_modules` and `dist` directories
- [ ] Run `npm install` again
- [ ] Run `npm run build` again
- [ ] Check for TypeScript compilation errors

### If Terraform Apply Fails
- [ ] Check AWS credentials are valid
- [ ] Check Terraform version >= 1.0
- [ ] Verify `dist/` directory exists
- [ ] Verify `dist/index.js` exists
- [ ] Check for IAM permission errors
- [ ] Review Terraform error messages

### If Lambda Invocation Fails
- [ ] Check Lambda function exists
- [ ] Check AWS CLI credentials
- [ ] Check function name is correct
- [ ] Review CloudWatch Logs for errors
- [ ] Check VPC networking configuration
- [ ] Verify security group rules
- [ ] Verify OpenSearch endpoint is correct
- [ ] Check IAM role permissions

### If Lambda Times Out
- [ ] Verify Lambda is in correct VPC
- [ ] Verify Lambda is in private subnets
- [ ] Check security group allows outbound HTTPS (port 443)
- [ ] Verify OpenSearch is accessible from Lambda subnets
- [ ] Check NAT Gateway is configured
- [ ] Review VPC route tables

### If Permission Denied
- [ ] Verify IAM role has `es:ESHttpPut` permission
- [ ] Verify IAM role has `es:ESHttpGet` permission
- [ ] Check OpenSearch domain access policies
- [ ] Verify Lambda execution role is correct
- [ ] Check resource-based policies

## Post-Deployment Checklist

### Documentation
- [ ] Document OpenSearch endpoint
- [ ] Document Lambda function name
- [ ] Document IAM role ARN
- [ ] Update deployment runbook
- [ ] Share access information with team

### Monitoring Setup
- [ ] CloudWatch Logs retention verified (365 days)
- [ ] Set up CloudWatch alarms (optional)
- [ ] Configure SNS notifications (optional)
- [ ] Test log aggregation (optional)

### Security Review
- [ ] IAM role follows least privilege
- [ ] Lambda in private subnets
- [ ] Security groups properly configured
- [ ] No hardcoded secrets
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled

### Cost Optimization
- [ ] Lambda memory appropriate (512 MB)
- [ ] Lambda timeout appropriate (60s)
- [ ] CloudWatch Logs retention appropriate (365 days)
- [ ] No unnecessary resources created

## Next Steps Checklist

- [ ] Index successfully created
- [ ] All verification steps passed
- [ ] Documentation updated
- [ ] Team notified
- [ ] Ready to proceed to Task 9.2 (Vector Store client)
- [ ] Ready to proceed to Task 10 (Document Processor)
- [ ] Ready to proceed to Task 11 (Embedding Generator)

## Sign-Off

- [ ] Deployment completed successfully
- [ ] All checklist items verified
- [ ] No outstanding issues
- [ ] Ready for next phase

**Deployed by**: _______________  
**Date**: _______________  
**Environment**: _______________  
**Notes**: _______________

---

## Quick Reference Commands

```bash
# Build Lambda
cd lambda/vector-store/init-index && bash build-for-terraform.sh

# Deploy with Terraform
cd terraform && terraform apply

# Invoke Lambda
FUNCTION_NAME=$(terraform output -raw vector_store_init_function_name)
aws lambda invoke --function-name $FUNCTION_NAME --payload '{}' response.json

# Check response
cat response.json

# View logs
aws logs tail /aws/lambda/$FUNCTION_NAME --follow

# Verify index
OPENSEARCH_ENDPOINT=$(terraform output -raw opensearch_endpoint)
echo "Index should exist at: https://$OPENSEARCH_ENDPOINT/documents"
```
