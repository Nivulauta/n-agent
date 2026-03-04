# WebSocket Message Handler Build Fix

## Overview
Fixed the websocket message handler build.mjs script to use the package.json `compile` script instead of calling `tsc` directly, and handle the TypeScript output path correctly.

## Problem
The build.mjs was calling `npm run build` which created a circular reference since the build script itself calls `node build.mjs`. Additionally, TypeScript was outputting files to a nested directory structure (`dist/websocket/message/src/index.js`) instead of the root dist directory.

## Solution

### 1. Added compile script to package.json
```json
"scripts": {
    "build": "node build.mjs",
    "compile": "tsc",  // Added this
    "test": "vitest run",
    ...
}
```

### 2. Updated build.mjs to use compile script
Changed from:
```javascript
execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
```

To:
```javascript
execSync('npm run compile', { stdio: 'inherit', cwd: __dirname });
```

### 3. Fixed index.js path handling
TypeScript without `rootDir` preserves the full directory structure, so the compiled file is at:
`dist/websocket/message/src/index.js`

Updated build.mjs to look for the file at the correct location:
```javascript
const indexJsPath = join(__dirname, 'dist', 'websocket', 'message', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');
```

### 4. Removed rootDir from tsconfig.json
Cannot use `rootDir: "./src"` because the source imports from outside the src directory (shared modules). TypeScript needs to compile all referenced files, which creates the nested structure.

## Build Process

1. **Install dependencies**: `npm install`
2. **Compile TypeScript**: `npm run compile` (runs `tsc`)
   - Outputs to `dist/websocket/message/src/index.js`
3. **Rename and move**: Move `index.js` to `dist/index.mjs`
4. **Copy dependencies**: Copy `node_modules` to `dist/`
5. **Copy shared modules**: Copy all shared libraries to `dist/shared/`
6. **Copy websocket shared**: Copy websocket shared to `dist/websocket-shared/`
7. **Fix imports**: Replace source paths with local dist paths

## Build Output Structure
```
lambda/websocket/message/dist/
├── index.mjs                  # Main handler (moved from nested path)
├── node_modules/              # All dependencies
├── shared/                    # Shared libraries
│   ├── rate-limiter/
│   ├── audit-logger/
│   ├── chat-history/
│   ├── query-router/
│   ├── rag/                   # Includes embeddings, vector-store, cache
│   ├── cache/
│   ├── bedrock/
│   └── circuit-breaker/
└── websocket-shared/          # WebSocket-specific shared code
    ├── message-sender.mjs
    └── types.mjs
```

## Verification

Build successful:
```bash
cd lambda/websocket/message
npm run build
# ✅ Build complete!
# 📁 Output: dist/index.mjs
# 📦 Dependencies: dist/node_modules/
# 🔗 Shared modules: dist/shared/
# 🔗 WebSocket shared: dist/websocket-shared/
```

All imports correctly transformed:
```javascript
// Before (source)
import { RateLimiter } from '../../../shared/rate-limiter/src/rate-limiter.js';

// After (compiled)
import { RateLimiter } from './shared/rate-limiter/rate-limiter.mjs';
```

## Benefits

1. **No circular reference**: Separate `compile` and `build` scripts
2. **Consistent pattern**: Matches connect/disconnect handler build pattern
3. **Self-contained**: All dependencies packaged in dist folder
4. **Correct imports**: All paths properly resolved to local copies

## Date
March 3, 2026
