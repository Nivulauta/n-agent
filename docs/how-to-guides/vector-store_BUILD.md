# Building Vector Store Lambda Functions

## Quick Build (All Functions)

```bash
cd lambda/vector-store
bash build-all.sh
```

This builds both Lambda functions with all dependencies included.

## Individual Builds

### Build init-index Lambda

```bash
cd lambda/vector-store/init-index
npm run build:terraform
```

### Build configure-access Lambda

```bash
cd lambda/vector-store/configure-access
npm run build:terraform
```

## What the Build Does

The `build:terraform` script:

1. **Installs dependencies** - `npm install`
2. **Compiles TypeScript** - `tsc` compiles `.ts` files to `.js`
3. **Copies node_modules** - Copies dependencies to `dist/` folder
4. **Verifies output** - Checks that `dist/index.js` exists

## Why Copy node_modules?

Lambda needs access to the dependencies at runtime. The Terraform `archive_file` data source creates a zip from the `dist/` folder, so we need everything in there:

```
dist/
├── index.js          # Compiled code
├── index.d.ts        # Type definitions
├── index.js.map      # Source maps
└── node_modules/     # Dependencies (REQUIRED!)
    ├── @opensearch-project/
    ├── aws-sdk/
    └── ...
```

## Troubleshooting

### Error: "Cannot find module '@opensearch-project/opensearch'"

The build didn't copy node_modules to dist. Run:

```bash
npm run build:terraform
```

NOT just `npm run build` (which only compiles TypeScript).

### Error: "dist directory not found"

TypeScript compilation failed. Check for syntax errors:

```bash
npm run build
```

### Error: "node_modules not found"

Dependencies not installed:

```bash
npm install
npm run build:terraform
```

### Clean Build

If you encounter issues, do a clean build:

```bash
npm run clean
npm run build:terraform
```

## Verify Build

Check that node_modules was copied:

```bash
# For init-index
ls -la lambda/vector-store/init-index/dist/node_modules

# For configure-access
ls -la lambda/vector-store/configure-access/dist/node_modules
```

You should see the dependencies listed.

## Build Output Size

Typical sizes:
- **init-index**: ~15-20 MB (with node_modules)
- **configure-access**: ~15-20 MB (with node_modules)

The OpenSearch client library is the largest dependency.

## Development vs Production Builds

### Development (Local Testing)

```bash
npm run build
```

Only compiles TypeScript. Use for local testing with `node dist/index.js`.

### Production (Terraform Deployment)

```bash
npm run build:terraform
```

Compiles TypeScript AND includes dependencies. Required for Lambda deployment.

## Continuous Integration

For CI/CD pipelines:

```bash
#!/bin/bash
set -e

# Install dependencies
cd lambda/vector-store/init-index
npm ci  # Use ci for reproducible builds

# Build for Terraform
npm run build:terraform

# Repeat for configure-access
cd ../configure-access
npm ci
npm run build:terraform
```

## Next Steps

After building:

1. Deploy with Terraform:
   ```bash
   cd terraform
   terraform apply
   ```

2. Configure OpenSearch access:
   ```bash
   bash scripts/configure_opensearch_access.sh
   ```

## Related Documentation

- [DEPLOYMENT_GUIDE.md](../../terraform/modules/vector-store-init/DEPLOYMENT_GUIDE.md) - Full deployment guide
- [OPENSEARCH_SETUP.md](../../terraform/OPENSEARCH_SETUP.md) - Quick setup reference
