# Lambda Build Process

## Overview

This document explains how the Lambda functions are built and packaged for deployment.

## Build Script

The `lambda/build.sh` script handles building all Lambda functions. It:

1. **Cleans the dist directory** - Removes old build artifacts
2. **Installs all dependencies** - Runs `npm install` (includes dev dependencies for compilation)
3. **Compiles TypeScript** - Runs `npm run build` (outputs to `dist/`)
4. **Reinstalls production dependencies** - Runs `npm install --production` to remove dev dependencies
5. **Copies node_modules** - Copies production-only `node_modules/` to `dist/node_modules/`

## Directory Structure After Build

```
lambda/auth/authorizer/
├── src/
│   └── index.ts
├── dist/
│   ├── index.js          # Compiled JavaScript
│   └── node_modules/     # Production dependencies
├── node_modules/         # All dependencies (dev + prod)
├── package.json
└── tsconfig.json
```

## Why Copy node_modules to dist?

Lambda functions need their dependencies at runtime. By copying `node_modules` to the `dist/` directory:

1. **Terraform can package everything** - The `archive_file` data source zips the entire `dist/` directory
2. **Lambda has access to dependencies** - All required packages are included in the deployment
3. **Clean separation** - The root `node_modules` includes dev dependencies, while `dist/node_modules` only has production dependencies

## Terraform Integration

Terraform uses the `archive_file` data source to automatically package the Lambda functions:

```hcl
data "archive_file" "authorizer" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/auth/authorizer/dist"
  output_path = "${path.module}/../../../lambda/auth/authorizer/dist/index.zip"
}
```

This creates a zip file containing:
- `index.js` (compiled code)
- `node_modules/` (production dependencies)

## Build Commands

### Build All Functions

```bash
cd lambda
chmod +x build.sh
./build.sh
```

### Build Individual Function

```bash
cd lambda/auth/authorizer

# Install all dependencies (for TypeScript compilation)
npm install

# Build TypeScript
npm run build

# Reinstall only production dependencies
rm -rf node_modules
npm install --production

# Copy to dist
cp -r node_modules dist/
```

## Deployment Workflow

1. **Build**: Run `./lambda/build.sh` to compile and prepare functions
2. **Package**: Terraform's `archive_file` automatically creates zip files
3. **Deploy**: Run `terraform apply` to deploy to AWS Lambda

## Production Dependencies

Each Lambda function has specific production dependencies:

### Authorizer
- `jsonwebtoken` - JWT token validation
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client

### Login
- `jsonwebtoken` - JWT token generation
- `bcryptjs` - Password hashing
- `uuid` - Unique ID generation
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client

### Logout
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client

## Development Dependencies

Development dependencies (TypeScript, types, testing) are NOT included in the Lambda deployment package. They're only used during the build process.

## Troubleshooting

### Issue: Lambda function fails with "Cannot find module"

**Cause**: Dependencies not included in deployment package

**Solution**: 
1. Ensure `npm install --production` ran successfully
2. Verify `node_modules` exists in `dist/` directory
3. Rebuild: `./lambda/build.sh`

### Issue: Deployment package too large

**Cause**: Dev dependencies included or unnecessary files

**Solution**:
1. Use `npm install --production` (not `npm install`)
2. Check `.gitignore` excludes unnecessary files
3. Consider using Lambda layers for large dependencies

### Issue: Terraform doesn't detect code changes

**Cause**: `source_code_hash` not updating

**Solution**:
1. Rebuild Lambda functions: `./lambda/build.sh`
2. Terraform will detect the hash change automatically
3. Run `terraform apply`

## Best Practices

1. **Install all dependencies for build** - Use `npm install` first to get dev dependencies for TypeScript compilation
2. **Use production dependencies for deployment** - After building, reinstall with `npm install --production` to exclude dev dependencies from the Lambda package
3. **Keep dist/ in .gitignore** - Don't commit build artifacts
4. **Rebuild before deployment** - Always run `./lambda/build.sh` before `terraform apply`
5. **Use Lambda layers for shared dependencies** - Consider layers for large or shared dependencies
6. **Monitor package size** - Lambda has a 50MB (zipped) / 250MB (unzipped) limit

## CI/CD Integration

For automated deployments:

```bash
#!/bin/bash
# CI/CD pipeline script

# Build Lambda functions
cd lambda
./build.sh

# Deploy with Terraform
cd ../terraform
terraform init
terraform plan
terraform apply -auto-approve
```

## File Size Optimization

To reduce deployment package size:

1. **Build then reinstall production only** - The build script does this automatically
2. **Remove unnecessary files** - Exclude tests, docs, examples
3. **Use webpack/esbuild** - Bundle and minify code (advanced)
4. **Use Lambda layers** - Share common dependencies across functions

The build process ensures only production dependencies are included in the final Lambda package, while still having access to dev dependencies (like TypeScript and type definitions) during compilation.

## Next Steps

After building:
1. Verify `dist/` contains `index.js` and `node_modules/`
2. Run `terraform plan` to see deployment changes
3. Run `terraform apply` to deploy to AWS
4. Test the deployed functions
