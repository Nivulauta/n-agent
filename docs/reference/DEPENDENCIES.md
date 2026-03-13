# Dependencies and Version Compatibility

## OpenSearch Client Library

Both Lambda functions use the `@opensearch-project/opensearch` client library.

### Current Version

```json
{
  "@opensearch-project/opensearch": "^2.12.0"
}
```

### Compatibility Matrix

| OpenSearch Server | Client Library | Status | Notes |
|-------------------|----------------|--------|-------|
| 3.3 | 2.12.0 | ✅ Compatible | Current configuration |
| 3.0 - 3.3 | 2.8.0 - 2.12.0 | ✅ Compatible | Recommended |
| 2.x | 2.5.0 - 2.12.0 | ✅ Compatible | Legacy support |
| 1.x | 1.x | ⚠️ Legacy | Not recommended |

### Version Selection

The client library version `2.12.0` is chosen because:

1. **Forward Compatible**: Works with OpenSearch 3.x servers
2. **Stable**: Well-tested and production-ready
3. **Feature Complete**: Supports all required features (k-NN, security API)
4. **Active Maintenance**: Receives security updates

### Upgrade Path

If you need to upgrade the client library:

```bash
cd lambda/vector-store/init-index
npm install @opensearch-project/opensearch@latest
npm run build:terraform

cd ../configure-access
npm install @opensearch-project/opensearch@latest
npm run build:terraform
```

Then redeploy with Terraform:

```bash
cd ../../terraform
terraform apply
```

## Other Dependencies

### init-index Lambda

```json
{
  "dependencies": {
    "@opensearch-project/opensearch": "^2.12.0",
    "aws-sdk": "^2.1540.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
```

### configure-access Lambda

```json
{
  "dependencies": {
    "@opensearch-project/opensearch": "^2.12.0",
    "aws-sdk": "^2.1691.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.145",
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

## AWS SDK

Both functions use AWS SDK v2 for compatibility with Lambda's built-in SDK.

### Why AWS SDK v2?

- **Pre-installed in Lambda**: Reduces package size
- **Stable**: Well-tested and production-ready
- **Sufficient**: Provides all required functionality

### Migrating to AWS SDK v3

If you want to use AWS SDK v3:

1. Update dependencies:
   ```bash
   npm install @aws-sdk/client-opensearch @aws-sdk/credential-providers
   npm uninstall aws-sdk
   ```

2. Update imports:
   ```typescript
   // Old (v2)
   import * as AWS from 'aws-sdk';
   
   // New (v3)
   import { OpenSearchClient } from '@aws-sdk/client-opensearch';
   import { fromEnv } from '@aws-sdk/credential-providers';
   ```

3. Update code to use v3 API patterns

## TypeScript

Both functions use TypeScript 5.x for type safety and modern JavaScript features.

### Compiler Options

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true
  }
}
```

## Testing

Both functions use Vitest for unit testing.

### Why Vitest?

- **Fast**: Native ESM support, parallel execution
- **Modern**: Better DX than Jest
- **Compatible**: Jest-compatible API

## Node.js Runtime

Lambda functions use Node.js 22.x runtime:

```hcl
locals {
  lambda_runtime = "nodejs22.x"
}
```

### Compatibility

- **Node.js 22.x**: Latest LTS, recommended and required
- **Node.js 20.x**: Also supported
- **Node.js 18.x**: No longer supported

## Security Updates

### Checking for Updates

```bash
cd lambda/vector-store/init-index
npm outdated

cd ../configure-access
npm outdated
```

### Updating Dependencies

```bash
# Update all dependencies
npm update

# Update specific dependency
npm install @opensearch-project/opensearch@latest

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## Dependency Lock Files

Both functions use `package-lock.json` for reproducible builds:

- **Commit lock files**: Ensures consistent builds across environments
- **Update regularly**: Run `npm update` periodically
- **Review changes**: Check lock file diffs in PRs

## CI/CD Considerations

For continuous integration:

```bash
# Use npm ci for reproducible builds
npm ci

# Don't use npm install (updates lock file)
npm install  # ❌ Don't use in CI

# Use npm ci (uses exact versions from lock file)
npm ci       # ✅ Use in CI
```

## Troubleshooting

### Version Conflicts

If you encounter version conflicts:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Compatibility Issues

If the client library doesn't work with your OpenSearch version:

1. Check the [compatibility matrix](https://github.com/opensearch-project/opensearch-js#compatibility)
2. Try a different client version
3. Check OpenSearch server logs for errors

### Build Errors

If TypeScript compilation fails:

```bash
# Update TypeScript
npm install typescript@latest --save-dev

# Clean build
npm run clean
npm run build:terraform
```

## References

- [OpenSearch JavaScript Client](https://github.com/opensearch-project/opensearch-js)
- [OpenSearch Compatibility](https://opensearch.org/docs/latest/clients/javascript/index/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Node.js Lambda Runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
