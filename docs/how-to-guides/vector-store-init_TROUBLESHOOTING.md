# Troubleshooting Vector Store Init

## 403 Forbidden Error

If you encounter a 403 error when the Lambda function tries to access OpenSearch, this is because the Lambda IAM role needs to be mapped to an OpenSearch role when fine-grained access control is enabled.

### Solution 1: Manual Role Mapping (Recommended)

1. **Get the Lambda Role ARN:**
   ```bash
   terraform output -module=vector_store_init lambda_role_arn
   ```

2. **Map the role using the Python script:**
   ```bash
   cd terraform/modules/vector-store-init/scripts
   
   python3 configure_opensearch_access.py \
     --endpoint "YOUR_OPENSEARCH_ENDPOINT" \
     --master-user "admin" \
     --master-password "YOUR_MASTER_PASSWORD" \
     --lambda-role-arn "arn:aws:iam::ACCOUNT:role/ROLE_NAME"
   ```

3. **Or use curl:**
   ```bash
   curl -X PUT "https://YOUR_OPENSEARCH_ENDPOINT/_plugins/_security/api/rolesmapping/all_access" \
     -u "admin:YOUR_MASTER_PASSWORD" \
     -H "Content-Type: application/json" \
     -d '{
       "backend_roles": ["arn:aws:iam::ACCOUNT:role/YOUR_LAMBDA_ROLE"],
       "hosts": [],
       "users": []
     }'
   ```

### Solution 2: Using OpenSearch Dashboards UI

1. Navigate to OpenSearch Dashboards (Kibana)
2. Go to Security → Roles
3. Select the `all_access` role
4. Go to "Mapped users" tab
5. Add the Lambda IAM role ARN as a backend role

### Solution 3: Disable Fine-Grained Access Control (Not Recommended for Production)

If you don't need fine-grained access control, you can disable it in the OpenSearch module:

```hcl
# In terraform/modules/opensearch/main.tf
advanced_security_options {
  enabled = false
}
```

**Note:** This is less secure and not recommended for production environments.

### Verification

After mapping the role, test the Lambda function:

```bash
aws lambda invoke \
  --function-name dev-vector-store-init-index \
  --payload '{}' \
  response.json

cat response.json
```

You should see a successful response:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"message\":\"Index 'documents' created successfully with k-NN configuration\"}"
}
```

### Common Issues

**Issue:** "User [arn:aws:sts::ACCOUNT:assumed-role/ROLE/FUNCTION] is not authorized"

**Solution:** The role mapping hasn't been applied yet. Follow Solution 1 or 2 above.

**Issue:** "Connection timeout"

**Solution:** Check that:
- Lambda is in the same VPC as OpenSearch
- Security groups allow traffic between Lambda and OpenSearch
- OpenSearch is in private subnets with proper routing

**Issue:** "SSL certificate verification failed"

**Solution:** Ensure you're using HTTPS and the correct endpoint. The OpenSearch endpoint should not include `https://` prefix when passed to the Lambda.

### Security Best Practices

1. **Use IAM authentication** (current setup) rather than master user/password in production
2. **Create a dedicated OpenSearch role** with minimal permissions instead of using `all_access`
3. **Rotate master password** regularly and store it in AWS Secrets Manager
4. **Enable audit logging** in OpenSearch for compliance

### Additional Resources

- [OpenSearch Fine-Grained Access Control](https://opensearch.org/docs/latest/security/access-control/index/)
- [AWS OpenSearch Service IAM](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html)
- [OpenSearch Security Plugin API](https://opensearch.org/docs/latest/security/access-control/api/)
