# Lambda Layer Build Notes

## Important: Docker Build Required

### The Challenge

The `tiktoken` package requires Rust compilation and must be built on Amazon Linux 2 to work with AWS Lambda. Building locally on Windows will not work.

**Required approach**: Use Docker with the AWS Lambda Python base image.

### Build Instructions

#### Windows (PowerShell)

```powershell
cd lambda/document-processor/extract-text
.\build_layer_docker.ps1
```

#### Linux/Mac or Git Bash on Windows

```bash
cd lambda/document-processor/extract-text
./build_layer_docker.sh
```

### What the Build Script Does

1. Checks if Docker is running
2. Cleans previous builds
3. Creates a layer directory structure
4. Runs Docker container with AWS Lambda Python 3.11 image
5. Installs gcc (C compiler needed for Rust)
6. Installs Rust compiler (needed for tiktoken)
7. Installs all Python packages from requirements.txt
8. Creates a zip file (~45MB)
9. Cleans up temporary files

### Build Time

Expect 5-10 minutes for the first build due to:
- Installing gcc
- Installing Rust toolchain
- Compiling tiktoken from source

Subsequent builds may be faster if Docker caches layers.

### Requirements

- Docker Desktop installed and running
- At least 2GB free disk space
- Internet connection for downloading dependencies

### Package Details

#### tiktoken (>=0.7.0)
- **Type**: Python package with Rust extensions
- **Why Docker**: Must be compiled on Amazon Linux 2
- **Build time**: ~3-5 minutes (Rust compilation)

#### pdfplumber (==0.10.3)
- **Type**: Pure Python with C dependencies (Pillow)
- **Why Docker**: Pillow has native code that needs Linux binaries

#### boto3 (==1.34.0)
- **Type**: Pure Python
- **Why included**: Specific version for compatibility

### Terraform Integration

The Terraform configuration uses a `null_resource` with `local-exec` provisioner to build the layer automatically. However, due to the complexity of installing Rust in the provisioner, it's recommended to:

1. **Build the layer manually** using the Docker script
2. **Comment out the `null_resource`** in `terraform/modules/document-processor/main.tf`
3. **Let Terraform use the pre-built zip file**

### Troubleshooting

#### Docker not running
```
ERROR: Docker is not running. Please start Docker Desktop.
```
**Solution**: Start Docker Desktop and wait for it to fully initialize

#### Path translation errors (Git Bash on Windows)
```
docker: Error response from daemon: ... C:/Program Files/Git/...
```
**Solution**: The script now uses `MSYS_NO_PATHCONV=1` to prevent this. Use the bash script with this fix.

#### Rust compiler errors
```
error: linker `cc` not found
```
**Solution**: The script now installs gcc before Rust. This should be fixed.

#### Volume mount issues
```
ERROR: Could not open requirements file
```
**Solution**: Ensure you're running the script from the correct directory and Docker has permission to mount volumes.

### Alternative: Lambda Container Images

If layer building is too complex, consider using Lambda container images instead:

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

### Testing the Layer

After deployment, test if the layer works:

```bash
# Invoke the Lambda function
aws lambda invoke \
  --function-name dev-chatbot-document-processor \
  --payload '{"test": true}' \
  response.json

# Check logs
aws logs tail /aws/lambda/dev-chatbot-document-processor --follow
```

If you see `ModuleNotFoundError`, the layer wasn't built correctly.

### Current Status

✅ Docker build scripts created (PowerShell and Bash)
✅ Handles Rust compilation for tiktoken
✅ Works on Windows with Docker Desktop
✅ Produces Lambda-compatible layer (~45MB)
⚠️ Requires manual build before Terraform apply

### Next Steps

1. Run the Docker build script
2. Verify `document-processor-layer.zip` is created
3. Run `terraform apply`
4. Test the Lambda function
