# RAG Library - Build Configuration

## Build Pattern

This shared library now uses the standard build pattern consistent with other shared libraries (rate-limiter, audit-logger, circuit-breaker, etc.) for ES module handling.

## Changes Made

### 1. Updated Build Script (`build.mjs`)

**Before:**
- Custom build script that copied dependencies
- Copied embeddings, vector-store, cache modules
- Created node_modules structure in dist

**After:**
- Standard build script matching other shared libraries
- Compiles TypeScript
- Renames `.js` to `.mjs`
- Fixes import paths

**Note:** Dependencies (embeddings, vector-store, cache) are now handled by the Lambda build script, not the library build script. This keeps the library build simple and consistent.

### 2. TypeScript Configuration (`tsconfig.json`)

Already configured correctly for ES2022 modules:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node"
  }
}
```

### 3. Package Configuration (`package.json`)

Already configured correctly:
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
```

## Output Structure

```
dist/
├── rag.mjs                      # Main RAG orchestration logic
├── rag.d.ts                     # TypeScript declarations
├── types.mjs                    # Type definitions
├── index.mjs                    # Main entry point
└── *.js.map                     # Source maps
```

## Dependencies

The RAG library depends on:
- **embeddings** - Bedrock Titan embedding generation
- **vector-store** - OpenSearch k-NN vector search
- **cache** - Redis caching layer

These dependencies are:
1. Built separately in their respective directories
2. Copied by the Lambda build script (not the library build script)
3. Available at runtime in Lambda's `dist/shared/` directory

## Usage in Lambda Functions

When used in Lambda functions, the Lambda build script:

1. Copies `dist/` contents to Lambda's `dist/shared/rag/`
2. Copies dependencies (embeddings, vector-store, cache) to `dist/shared/`
3. Adds `package.json` with `{"type": "module"}` for ES module support
4. Transforms imports from source paths to local paths

**Source import:**
```typescript
import { RAGSystem } from '../../../shared/rag/src/rag.js';
```

**Lambda dist import:**
```javascript
import { RAGSystem } from './shared/rag/rag.mjs';
```

## Benefits

- **Consistency** - Same pattern across all shared libraries
- **Simplicity** - Library build focuses only on compilation, not dependency management
- **Separation of Concerns** - Lambda build handles dependency bundling
- **ES Module Support** - Explicit `.mjs` extension for Node.js
- **Type Safety** - TypeScript compilation with type checking

## Migration Notes

The key change is that the RAG library build script no longer copies dependencies. This is now handled by:

1. **Lambda build scripts** - Copy all shared modules including dependencies
2. **Runtime resolution** - Node.js resolves dependencies from `dist/shared/`

This makes the RAG library build consistent with other shared libraries while maintaining all functionality.
