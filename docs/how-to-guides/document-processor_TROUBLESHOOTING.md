# Lambda Layer Build Troubleshooting

## Quick Fixes

### Issue: Docker not running

```
ERROR: Docker is not running. Please start Docker Desktop.
```

**Solution**: Start Docker Desktop and wait for it to fully initialize.

### Issue: Lambda function fails with "ModuleNotFoundError"

**Cause**: Layer wasn't built or wasn't built correctly.

**Solution**: Build layer using Docker:

```bash
cd lambda/document-processor/extract-text
./build_layer_docker.sh  # or .ps1 on Windows
```

Then deploy with Terraform:
```bash
cd terraform
terraform apply
```

### Issue: Path translation errors (Git Bash on Windows)

```
docker: Error response from daemon: ... C:/Program Files/Git/...
```

**Solution**: The bash script uses `MSYS_NO_PATHCONV=1` to prevent this. Make sure you're using the latest version of `build_layer_docker.sh`.

### Issue: Rust compiler errors

```
error: linker `cc` not found
```

**Solution**: The script installs gcc before Rust. Make sure you're using the latest version of the build script.

### Issue: Volume mount issues

```
ERROR: Could not open requirements file
```

**Solution**: 
- Ensure you're running the script from `lambda/document-processor/extract-text` directory
- Check that Docker Desktop has permission to mount volumes (Settings > Resources > File Sharing)
- On Windows, ensure the drive is shared in Docker Desktop settings

## Verification Steps

### 1. Check if layer directory exists

```bash
ls -la lambda/document-processor/extract-text/layer/python/
```

Should show: pdfplumber, tiktoken, boto3, PIL, etc.

### 2. Check if layer was deployed

```bash
terraform output document_processor_layer_arn
```

### 3. Test Lambda function

```bash
# Invoke function
aws lambda invoke \
  --function-name dev-chatbot-document-processor \
  --payload '{"test": true}' \
  response.json

# View response
cat response.json
```

### 4. Check CloudWatch Logs

```bash
aws logs tail /aws/lambda/dev-chatbot-document-processor --follow
```

Look for:
- ✅ "PDF opened successfully" - Layer works!
- ❌ "ModuleNotFoundError: No module named 'tiktoken'" - Layer issue
- ❌ "ImportError: cannot import name" - Version mismatch

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Docker not running | Docker Desktop not started | Start Docker Desktop |
| ModuleNotFoundError | Layer not built | Run build_layer_docker script |
| Path translation | Git Bash converting paths | Script uses MSYS_NO_PATHCONV=1 |
| Rust compiler error | Missing gcc | Script installs gcc first |
| Layer too large | Dependencies exceed 250MB | Remove unnecessary packages |
| Permission denied | IAM role missing permissions | Check Lambda execution role |

## Best Practices

### For Development (Windows)

1. **Use Docker** for building layers
2. **Build layer first** before running Terraform
3. **Check logs** after deployment

### For Production

1. **Use CI/CD** (GitHub Actions, GitLab CI)
2. **Build on Linux** runners
3. **Store layers** in S3 or artifact repository
4. **Version layers** for rollback capability

## Alternative: Lambda Container Images

If layer building is too complex, consider using Lambda container images:

```dockerfile
FROM public.ecr.aws/lambda/python:3.11

COPY requirements.txt .
RUN yum install -y gcc && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    source $HOME/.cargo/env && \
    pip install -r requirements.txt

COPY index.py ${LAMBDA_TASK_ROOT}

CMD ["index.handler"]
```

Container images support up to 10GB and eliminate layer complexity.

## Getting Help

If you're still stuck:

1. Check the full error message in CloudWatch Logs
2. Verify Python version matches (3.11)
3. Check package versions in requirements.txt
4. Ensure Docker is running and has volume mount permissions
5. Try building with the Docker script again

## Quick Reference

```bash
# Build layer with Docker (required)
cd lambda/document-processor/extract-text
./build_layer_docker.sh  # or .ps1 on Windows

# Deploy with Terraform
cd terraform
terraform apply

# Test Lambda function
aws lambda invoke --function-name FUNCTION_NAME --payload '{}' response.json

# View logs
aws logs tail /aws/lambda/FUNCTION_NAME --follow

# List layers
aws lambda list-layers

# Delete layer version
aws lambda delete-layer-version --layer-name LAYER_NAME --version-number VERSION
```
