# Query Router Library - Build Configuration

## Build Pattern

This shared library now uses the standard build pattern consistent with other shared libraries (rate-limiter, audit-logger, circuit-breaker, etc.) for ES module handling.

## Changes Made

### 1. Updated TypeScript Configuration (`tsconfig.json`)

**Before:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs"
  }
}
```

**After:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node"
  }
}
```

### 2. Created Build Script (`build.mjs`)

New cross-platform Node.js script that:

1. **Compiles TypeScript** - `tsc` compiles to JavaScript
2. **Renames files** - `.js` → `.mjs` for explicit ES module support
3. **Fixes imports** - Updates import paths to use `.mjs` extensions

### 3. Updated Package Configuration (`package.json`)

**Before:**
```json
{
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc"
  }
}
```

**After:**
```json
{
  "type": "module",
  "main": "dist/index.mjs",
  "scripts": {
    "build": "node build.mjs"
  }
}
```

## Build Commands

```bash
# Build the library
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch
```

## Output Structure

```
dist/
├── classifier.mjs               # Query classification logic
├── classifier.d.ts              # TypeScript declarations
├── claude-classifier.mjs        # Claude-based classification
├── types.mjs                    # Type definitions
├── index.mjs                    # Main entry point
└── *.js.map                     # Source maps
```

## Test Results

All 32 tests pass:
- Dynamic K Selection (21 tests)
- Classification Confidence (4 tests)
- Reasoning (4 tests)
- Requirement 7.5 Validation (3 tests)

## Usage in Lambda Functions

When used in Lambda functions, the build script:

1. Copies `dist/` contents to Lambda's `dist/shared/query-router/`
2. Adds `package.json` with `{"type": "module"}` for ES module support
3. Transforms imports from source paths to local paths

**Source import:**
```typescript
import { classifyQuery } from '../../../shared/query-router/src/classifier.js';
```

**Lambda dist import:**
```javascript
import { classifyQuery } from './shared/query-router/classifier.mjs';
```

## Benefits

- **Consistency** - Same pattern across all shared libraries
- **ES Module Support** - Explicit `.mjs` extension for Node.js
- **Type Safety** - TypeScript compilation with type checking
- **Modern JavaScript** - ES2022 target for latest features
- **Cross-Platform** - Node.js build script works everywhere
