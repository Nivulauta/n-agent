# Build System Update - Standard build.mjs Pattern

## Overview
Updated all auth and document Lambda functions to use a standardized, cross-platform `build.mjs` build script instead of PowerShell-based build commands.

## Benefits

### 1. Cross-Platform Compatibility
- Works on Windows, macOS, and Linux
- No dependency on PowerShell
- Uses Node.js built-in modules only

### 2. Consistency
- All Lambda functions use the same build pattern
- Easier to maintain and understand
- Predictable build output structure

### 3. Reliability
- Proper error handling
- Clear build steps with progress indicators
- Automatic cleanup of old builds

### 4. Simplicity
- Single command: `npm run build`
- No complex shell commands in package.json
- Easy to debug and modify

## Updated Lambda Functions

### Auth Lambdas
1. ✅ `lambda/auth/login/` - Login endpoint
2. ✅ `lambda/auth/logout/` - Logout endpoint

### Document Lambdas
1. ✅ `lambda/documents/upload/` - Document upload
2. ✅ `lambda/documents/list/` - Document list
3. ✅ `lambda/documents/delete/` - Document delete

## Build Script Structure

Each `build.mjs` follows this pattern:

```javascript
#!/usr/bin/env node

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Step 1: Clean dist directory
// Step 2: Install dependencies
// Step 3: Build TypeScript
// Step 4: Rename index.js to index.mjs
// Step 5: Copy shared modules
// Step 6: Fix import paths
// Step 7: Copy node_modules
```

## Build Steps Explained

### Step 1: Clean dist directory
```javascript
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });
```
- Removes old build artifacts
- Creates fresh dist directory

### Step 2: Install dependencies
```javascript
execSync('npm install', { stdio: 'inherit', cwd: __dirname });
```
- Ensures all dependencies are installed
- Uses current directory as working directory

### Step 3: Build TypeScript
```javascript
execSync('npx tsc', { stdio: 'inherit', cwd: __dirname });
```
- Compiles TypeScript to JavaScript
- Uses tsconfig.json configuration

### Step 4: Rename to index.mjs
```javascript
const indexJsPath = join(__dirname, 'dist', 'auth', 'login', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');

if (existsSync(indexJsPath)) {
    cpSync(indexJsPath, indexMjsPath);
    // Clean up nested structure
    rmSync(nestedDir, { recursive: true, force: true });
}
```
- Moves compiled index.js to dist root
- Renames to index.mjs for ES module support
- Cleans up nested directory structure

### Step 5: Copy shared modules
```javascript
const auditLoggerSource = join(__dirname, '..', '..', 'shared', 'audit-logger', 'dist');
const auditLoggerDest = join(__dirname, 'dist', 'shared', 'audit-logger');

mkdirSync(auditLoggerDest, { recursive: true });
cpSync(auditLoggerSource, auditLoggerDest, { recursive: true });
```
- Copies required shared modules to dist
- Maintains directory structure
- Adds package.json for ES module support

### Step 6: Fix import paths
```javascript
let indexContent = readFileSync(indexMjsPath, 'utf-8');

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/audit-logger\/src\/audit-logger\.js['"]/g,
    "from './shared/audit-logger/audit-logger.mjs'"
);

writeFileSync(indexMjsPath, indexContent, 'utf-8');
```
- Updates import paths to point to local copies
- Changes .js extensions to .mjs
- Ensures proper ES module resolution

### Step 7: Copy node_modules
```javascript
const nodeModulesSource = join(__dirname, 'node_modules');
const nodeModulesDest = join(__dirname, 'dist', 'node_modules');

cpSync(nodeModulesSource, nodeModulesDest, { recursive: true });
```
- Copies all dependencies to dist
- Ensures Lambda has all required packages
- Self-contained deployment package

## Usage

### Building a Single Lambda
```bash
cd lambda/auth/login
npm run build
```

### Building All Auth Lambdas
```bash
cd lambda/auth/login && npm run build
cd ../logout && npm run build
```

### Building All Document Lambdas
```bash
cd lambda/documents/upload && npm run build
cd ../list && npm run build
cd ../delete && npm run build
```

### Building All Updated Lambdas
```bash
# Auth
cd lambda/auth/login && npm run build && cd ../logout && npm run build

# Documents
cd ../../documents/upload && npm run build
cd ../list && npm run build
cd ../delete && npm run build
```

## Output Structure

After building, each Lambda has this structure:

```
lambda/auth/login/dist/
├── index.mjs                    # Main Lambda handler
├── node_modules/                # All dependencies
└── shared/                      # Shared modules
    └── audit-logger/
        ├── audit-logger.mjs
        ├── types.mjs
        └── package.json
```

## Package.json Changes

### Before
```json
{
  "scripts": {
    "build": "powershell -Command \"Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue\" & tsc & powershell -ExecutionPolicy Bypass -File ../../shared/fix-imports.ps1 -Path \"dist/shared/audit-logger/src\" & powershell -Command \"Move-Item dist/auth/login/src/index.js dist/index.mjs -Force; (Get-Content dist/index.mjs) -replace '../../../shared/audit-logger/src/audit-logger.js', './shared/audit-logger/src/audit-logger.mjs' | Set-Content dist/index.mjs\""
  }
}
```

### After
```json
{
  "scripts": {
    "build": "node build.mjs"
  }
}
```

## Shared Modules Handling

### Auth Lambdas
- `audit-logger` - For logging user actions

### Document Upload Lambda
- `audit-logger` - For logging document operations

### Document Delete Lambda
- `audit-logger` - For logging document operations
- `vector-store` - For OpenSearch operations

### Document List Lambda
- No shared modules (standalone)

## Deployment

After building, deploy with Terraform:

```bash
cd terraform

# Deploy specific modules
terraform apply -target=module.auth
terraform apply -target=module.document_management

# Or deploy everything
terraform apply
```

## Troubleshooting

### Build Fails with "Cannot find module"
- Ensure shared modules are built first:
  ```bash
  cd lambda/shared/audit-logger && npm run build
  cd ../vector-store && npm run build
  ```

### Import Errors at Runtime
- Check that import paths in index.mjs are correct
- Verify shared modules are copied to dist/shared/
- Ensure package.json exists in shared module directories

### Permission Errors on Windows
- Run terminal as administrator
- Or use Git Bash instead of PowerShell

### Build Script Not Executable
```bash
chmod +x build.mjs
```

## Migration Checklist

For each Lambda function:

- [x] Create build.mjs file
- [x] Update package.json build script
- [x] Test build locally
- [x] Verify dist output structure
- [x] Test Lambda deployment
- [x] Verify Lambda execution

## Completed Migrations

### Auth Module
- [x] lambda/auth/login/build.mjs
- [x] lambda/auth/login/package.json
- [x] lambda/auth/logout/build.mjs
- [x] lambda/auth/logout/package.json

### Document Module
- [x] lambda/documents/upload/build.mjs
- [x] lambda/documents/upload/package.json
- [x] lambda/documents/list/build.mjs
- [x] lambda/documents/list/package.json
- [x] lambda/documents/delete/build.mjs
- [x] lambda/documents/delete/package.json

## Future Improvements

1. **Shared Build Utility**: Create a reusable build function
2. **Build All Script**: Single script to build all Lambdas
3. **Watch Mode**: Auto-rebuild on file changes
4. **Minification**: Add code minification for smaller packages
5. **Source Maps**: Generate source maps for debugging

## Related Files
- `lambda/chat/history/build.mjs` - Example build script
- `lambda/shared/*/build.mjs` - Shared module build scripts
- `terraform/modules/auth/main.tf` - Auth Lambda deployment
- `terraform/modules/document-management/main.tf` - Document Lambda deployment

## Summary

All auth and document Lambda functions now use a standardized, cross-platform build system that:
- Works on any operating system
- Provides clear build steps
- Handles shared modules correctly
- Produces consistent output
- Is easy to maintain and extend

The build process is now simpler, more reliable, and easier to understand.
