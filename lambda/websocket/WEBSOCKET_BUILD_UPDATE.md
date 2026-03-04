# WebSocket Handlers Build Update

## Overview
Updated websocket shared library, connect handler, and disconnect handler to use the standard build.mjs pattern for consistency across all Lambda functions.

## Changes Made

### 1. WebSocket Shared Library (`lambda/websocket/shared/`)

**Created**: `build.mjs`
- Compiles TypeScript using `tsc`
- Renames `.js` files to `.mjs`
- Fixes import paths to use `.mjs` extensions

**Updated**: `package.json`
- Changed build script from `tsc` to `node build.mjs`
- Added `compile` script for internal use

**Updated**: `tsconfig.json`
- Changed from `module: "ESNext"` with `moduleResolution: "bundler"` to `module: "ES2022"` with `moduleResolution: "node"`
- Maintains ES2022 target for consistency

### 2. WebSocket Connect Handler (`lambda/websocket/connect/`)

**Created**: `build.mjs`
- Installs dependencies
- Compiles TypeScript
- Renames `index.js` to `index.mjs`
- Copies `node_modules` to dist
- Copies shared audit-logger module
- Fixes import paths to reference local copies

**Updated**: `package.json`
- Changed build script from complex PowerShell command to `node build.mjs`
- Added `compile` script that runs `tsc`
- Removed platform-specific PowerShell commands

**Updated**: `tsconfig.json`
- Changed from `module: "ESNext"` with `moduleResolution: "bundler"` to `module: "ES2022"` with `moduleResolution: "node"`
- Changed `include` from `["src/index.ts"]` to `["src/**/*"]` for consistency
- Added `declaration: true`

### 3. WebSocket Disconnect Handler (`lambda/websocket/disconnect/`)

**Created**: `build.mjs`
- Same pattern as connect handler
- Installs dependencies
- Compiles TypeScript
- Renames `index.js` to `index.mjs`
- Copies `node_modules` to dist
- Copies shared audit-logger module
- Fixes import paths to reference local copies

**Updated**: `package.json`
- Changed build script from complex PowerShell command to `node build.mjs`
- Added `compile` script that runs `tsc`
- Removed platform-specific PowerShell commands

**Updated**: `tsconfig.json`
- Changed from `module: "ESNext"` with `moduleResolution: "bundler"` to `module: "ES2022"` with `moduleResolution: "node"`
- Changed `include` from `["src/index.ts"]` to `["src/**/*"]` for consistency
- Added `declaration: true`

## Build Output Structure

### WebSocket Shared
```
lambda/websocket/shared/dist/
├── index.mjs
├── message-sender.mjs
├── types.mjs
└── *.d.ts (declaration files)
```

### Connect Handler
```
lambda/websocket/connect/dist/
├── index.mjs                  # Main handler
├── node_modules/              # All dependencies
└── shared/
    └── audit-logger/          # Copied from shared/audit-logger/dist
        ├── audit-logger.mjs
        ├── types.mjs
        └── package.json
```

### Disconnect Handler
```
lambda/websocket/disconnect/dist/
├── index.mjs                  # Main handler
├── node_modules/              # All dependencies
└── shared/
    └── audit-logger/          # Copied from shared/audit-logger/dist
        ├── audit-logger.mjs
        ├── types.mjs
        └── package.json
```

## Benefits

1. **Cross-platform compatibility**: No more PowerShell-specific commands
2. **Consistency**: All websocket handlers use the same build pattern as other Lambdas
3. **Maintainability**: Standard build.mjs pattern is easier to understand and modify
4. **Self-contained**: Each Lambda dist folder contains all dependencies
5. **Correct module resolution**: ES2022 modules with node resolution for proper import handling

## Build Verification

All builds successful:
```bash
cd lambda/websocket/shared
npm run build
# ✅ Build complete! Output: dist/*.mjs

cd lambda/websocket/connect
npm run build
# ✅ Build complete! Output: dist/index.mjs

cd lambda/websocket/disconnect
npm run build
# ✅ Build complete! Output: dist/index.mjs
```

## Import Examples

Before (source):
```typescript
import { logUserAction } from '../../../shared/audit-logger/src/audit-logger.js';
```

After (compiled):
```javascript
import { logUserAction } from './shared/audit-logger/audit-logger.mjs';
```

## Date
March 3, 2026
