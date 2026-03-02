# Build Fix Summary - Chat History Lambda

## Issue

The compiled `dist/index.mjs` file contained import references to non-local directories:
```javascript
import { ChatHistoryStore } from '../../../shared/chat-history/src/chat-history.js';
```

This would fail in Lambda deployment because the shared module is not included in the deployment package.

## Solution

Implemented a cross-platform Node.js build script (`build.mjs`) that:

1. **Compiles TypeScript** - Transpiles the source code
2. **Bundles shared modules** - Copies the shared chat-history module into `dist/shared/`
3. **Fixes import paths** - Rewrites imports to point to bundled local copies
4. **Includes dependencies** - Copies node_modules for Lambda runtime

## Changes Made

### 1. Created `build.mjs`
A Node.js build script that handles:
- TypeScript compilation
- Copying shared modules to `dist/shared/chat-history/`
- Rewriting import paths from `../../../shared/chat-history/src/chat-history.js` to `./shared/chat-history/chat-history.mjs`
- Bundling node_modules

### 2. Updated `build-for-terraform.sh`
Now delegates to the Node.js build script for cross-platform compatibility:
```bash
node build.mjs
```

### 3. Updated `build-for-terraform.ps1`
PowerShell script also delegates to Node.js build script:
```powershell
node build.mjs
```

### 4. Updated `package.json`
Changed build script to use the new build.mjs:
```json
"scripts": {
  "build": "node build.mjs"
}
```

## Result

### Before Fix
```javascript
// dist/index.mjs
import { ChatHistoryStore } from '../../../shared/chat-history/src/chat-history.js';
```
❌ Would fail in Lambda - path points outside deployment package

### After Fix
```javascript
// dist/index.mjs
import { ChatHistoryStore } from './shared/chat-history/chat-history.mjs';
```
✅ Works in Lambda - imports from bundled local copy

## Build Output Structure

```
dist/
├── index.mjs                    # Main Lambda handler
├── node_modules/                # AWS SDK dependencies
│   ├── @aws-sdk/
│   └── ...
└── shared/                      # Bundled shared modules
    └── chat-history/
        ├── chat-history.mjs
        ├── types.mjs
        ├── encryption.mjs
        └── package.json
```

## How to Build

### Option 1: Using npm
```bash
npm run build
```

### Option 2: Using build scripts
```bash
# Linux/Mac
./build-for-terraform.sh

# Windows PowerShell
./build-for-terraform.ps1
```

### Option 3: Direct Node.js
```bash
node build.mjs
```

## Verification

After building, verify the import paths:
```bash
head -n 1 dist/index.mjs
```

Should output:
```javascript
import { ChatHistoryStore } from './shared/chat-history/chat-history.mjs';
```

## Benefits

1. **Cross-platform** - Works on Windows, Linux, and Mac
2. **Self-contained** - All dependencies bundled in dist/
3. **Lambda-ready** - No external path references
4. **Consistent** - Same pattern as other Lambda functions in the project

## Related Files

- `build.mjs` - Main build script
- `build-for-terraform.sh` - Bash wrapper
- `build-for-terraform.ps1` - PowerShell wrapper
- `package.json` - Updated build command
- `tsconfig.json` - TypeScript configuration (unchanged)
