# RAG Library Packaging Update

## Overview
Updated the RAG library build process to include its sibling dependencies (embeddings, vector-store, cache) in the dist directory for proper packaging in consuming Lambda functions.

## Problem
The RAG library imports from three sibling modules:
- `@chatbot/embeddings` 
- `@chatbot/vector-store`
- `@chatbot/cache`

When the WebSocket message handler copied the RAG dist folder, these sibling dependencies weren't included, causing import resolution issues at runtime.

## Solution
Modified `build.mjs` to:

1. **Copy sibling dependencies** into `dist/` after TypeScript compilation
   - Copies `embeddings/dist/` → `dist/embeddings/`
   - Copies `vector-store/dist/` → `dist/vector-store/`
   - Copies `cache/dist/` → `dist/cache/`

2. **Fix import paths** in compiled `.mjs` files
   - Changes: `../../embeddings/dist/embeddings.js` → `./embeddings/embeddings.mjs`
   - Changes: `../../vector-store/dist/opensearch-client.js` → `./vector-store/opensearch-client.mjs`
   - Changes: `../../cache/dist/cache.js` → `./cache/cache.mjs`

3. **Add package.json** to each sibling dependency for ES module support

## Build Output Structure
```
lambda/shared/rag/dist/
├── rag.mjs                    # Main RAG module
├── types.mjs                  # Type definitions
├── index.mjs                  # Entry point
├── embeddings/                # Copied from sibling
│   ├── embeddings.mjs
│   ├── types.mjs
│   └── package.json
├── vector-store/              # Copied from sibling
│   ├── opensearch-client.mjs
│   ├── types.mjs
│   └── package.json
└── cache/                     # Copied from sibling
    ├── cache.mjs
    ├── types.mjs
    └── package.json
```

## Benefits

1. **Self-contained packaging**: RAG library dist is now fully self-contained with all dependencies
2. **Simplified Lambda builds**: Consuming Lambdas just copy the RAG dist folder and get everything
3. **Correct import resolution**: All imports resolve to local copies within the RAG dist directory
4. **No duplicate copies**: WebSocket handler no longer needs to separately copy embeddings, vector-store, and cache

## Verification

Build successful:
```bash
cd lambda/shared/rag
npm run build
# ✅ Copied embeddings
# ✅ Copied vector-store
# ✅ Copied cache
# ✅ Fixed imports in rag.mjs
```

WebSocket message handler build successful:
```bash
cd lambda/websocket/message
node build.mjs
# ✅ Copied shared/rag (now includes sibling dependencies)
```

## Import Examples

Before (broken):
```javascript
// In rag.mjs - references non-existent paths
import { EmbeddingGenerator } from '../../embeddings/dist/embeddings.mjs';
```

After (working):
```javascript
// In rag.mjs - references local copies
import { EmbeddingGenerator } from './embeddings/embeddings.mjs';
```

## Date
March 3, 2026
