# Lambda Layer Build Instructions

## Important: Docker Build Required

The `tiktoken` package requires Rust compilation and must be built using Docker with the AWS Lambda Python base image. Local builds will not work.

## Build Instructions

### Windows (PowerShell)

```powershell
cd lambda/document-processor/extract-text
.\build_layer_docker.ps1
```

### Linux/Mac or Git Bash on Windows

```bash
cd lambda/document-processor/extract-text
chmod +x build_layer_docker.sh
./build_layer_docker.sh
```

## What Happens During Build

1. Checks if Docker is running
2. Cleans previous builds
3. Creates layer directory structure
4. Runs AWS Lambda Python 3.11 Docker container
5. Installs gcc (C compiler for Rust)
6. Installs Rust compiler (required for tiktoken)
7. Installs all Python packages from requirements.txt
8. Creates `document-processor-layer.zip` (~45MB)
9. Cleans up temporary files

## Build Time

Expect 5-10 minutes for the first build:
- Installing gcc: ~1 minute
- Installing Rust toolchain: ~2-3 minutes
- Compiling tiktoken: ~3-5 minutes
- Installing other packages: ~1 minute

## Requirements

- Docker Desktop installed and running
- At least 2GB free disk space
- Internet connection

## Upload to AWS (Optional)

If you want to upload the layer manually instead of using Terraform:

```bash
aws lambda publish-layer-version \
  --layer-name chatbot-document-processor-deps \
  --description "Dependencies for document processor: pdfplumber, tiktoken, boto3" \
  --zip-file fileb://document-processor-layer.zip \
  --compatible-runtimes python3.11
```

Save the `LayerVersionArn` from the output.

## Use with Terraform

1. **Build the layer** using the Docker script (see above)
2. **Verify** the `layer/` directory exists in `lambda/document-processor/extract-text/`
3. **Run Terraform**:
   ```bash
   cd terraform
   terraform apply
   ```

Terraform will package the pre-built layer directory and deploy it.

## Troubleshooting

### Docker not running

```
ERROR: Docker is not running. Please start Docker Desktop.
```

**Solution**: Start Docker Desktop and wait for it to fully initialize.

### Path translation errors (Git Bash on Windows)

```
docker: Error response from daemon: ... C:/Program Files/Git/...
```

**Solution**: The bash script uses `MSYS_NO_PATHCONV=1` to prevent this. Make sure you're using the latest version of the script.

### Rust compiler errors

```
error: linker `cc` not found
```

**Solution**: The script installs gcc before Rust. This should be fixed in the latest version.

### Volume mount issues

```
ERROR: Could not open requirements file
```

**Solution**: 
- Ensure you're running the script from `lambda/document-processor/extract-text` directory
- Check that Docker Desktop has permission to mount volumes (Settings > Resources > File Sharing)

### Layer too large

If the layer exceeds Lambda's 250MB unzipped limit:

1. Remove unnecessary packages from requirements.txt
2. Consider using Lambda container images instead

## Verification

After deployment, test the layer:

```bash
# Invoke Lambda function
aws lambda invoke \
  --function-name dev-chatbot-document-processor \
  --payload '{"test": true}' \
  response.json

# Check logs
aws logs tail /aws/lambda/dev-chatbot-document-processor --follow
```

Look for successful imports:
- ✅ No import errors = Layer works!
- ❌ `ModuleNotFoundError` = Rebuild with Docker

## File Structure

After building, your layer has this structure:

```
document-processor-layer.zip
└── python/
    ├── pdfplumber/
    ├── tiktoken/
    ├── boto3/
    ├── PIL/
    └── ... (other packages and dependencies)
```

The `python/` directory is required for Lambda to find the packages.

## Dependencies

Current requirements:
- `pdfplumber==0.10.3` - PDF text extraction
- `boto3==1.34.0` - AWS SDK
- `tiktoken>=0.7.0` - Token counting (requires Rust compilation)

## Why Docker is Required

| Package | Type | Requires Docker |
|---------|------|-----------------|
| tiktoken | Rust extensions | ✅ Yes |
| pdfplumber | Python + C deps (Pillow) | ✅ Yes |
| boto3 | Pure Python | ❌ No |

Since tiktoken requires Rust compilation for the target platform (Amazon Linux 2), Docker is mandatory.

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
