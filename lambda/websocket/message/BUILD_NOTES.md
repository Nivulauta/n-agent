# WebSocket Message Handler - Build Configuration

## Build Pattern

This Lambda function uses the same build pattern as `generate-embeddings` lambda for consistent ES module handling across the project.

## Build Process

### 1. TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    // NO rootDir - allows TypeScript to compile imported files
    "skipLibCheck": true,
    "declaration": false  // Disabled to avoid rootDir issues
  }
}
```

**Key Points:**
- No `rootDir` specified - allows TypeScript to follow imports outside src/
- `skipLibCheck: true` - skips type checking of declaration files
- `declaration: false` - avoids declaration file generation issues with shared modules

### 2. Build Script (`build.mjs`)

Cross-platform Node.js script that:

1. **Installs dependencies** - `npm install`
2. **Compiles TypeScript** - `npm run build` (tsc)
3. **Renames output** - `index.js` → `index.mjs` for explicit ES module
4. **Copies node_modules** - All dependencies to `dist/node_modules/`
5. **Copies shared modules** - From `lambda/shared/*/dist` to `dist/shared/`
6. **Copies WebSocket shared** - From `lambda/websocket/shared/dist` to `dist/websocket-shared/`
7. **Fixes import paths** - Rewrites relative imports to local paths

### 3. Import Path Transformation

**Before (source):**
```typescript
import { RateLimiter } from '../../../shared/rate-limiter/src/rate-limiter.js';
import { MessageSender } from '../../shared/src/message-sender.js';
```

**After (dist):**
```javascript
import { RateLimiter } from './shared/rate-limiter/rate-limiter.mjs';
import { MessageSender } from './websocket-shared/message-sender.mjs';
```

## Shared Modules Included

The build copies these pre-built shared modules:

- `rate-limiter` - Rate limiting with sliding window
- `audit-logger` - CloudWatch structured logging
- `chat-history` - DynamoDB chat persistence with encryption
- `query-router` - Query classification for RAG
- `rag` - RAG orchestration with OpenSearch
- `cache` - Redis caching layer
- `bedrock` - Claude 3 Sonnet integration
- `circuit-breaker` - Circuit breaker pattern for resilience
- `websocket-shared` - WebSocket message utilities

## Build Commands

```bash
# Standard TypeScript build (for development/testing)
npm run build

# Lambda deployment build (includes dependencies and shared modules)
npm run build:lambda
# or
node build.mjs
```

## Output Structure

```
dist/
├── index.mjs                    # Main Lambda handler
├── index.d.mts                  # Type declarations
├── index.js.map                 # Source map
├── node_modules/                # All dependencies
├── shared/                      # Shared Lambda modules
│   ├── rate-limiter/
│   ├── audit-logger/
│   ├── chat-history/
│   ├── query-router/
│   ├── rag/
│   ├── cache/
│   ├── bedrock/
│   └── circuit-breaker/
└── websocket-shared/            # WebSocket utilities
    ├── message-sender.mjs
    └── types.mjs
```

## Prerequisites

Before building this Lambda, ensure shared modules are built:

```bash
# Build shared modules
cd lambda/shared/rate-limiter && npm run build
cd lambda/shared/audit-logger && npm run build
cd lambda/shared/chat-history && npm run build
cd lambda/shared/query-router && npm run build
cd lambda/shared/rag && npm run build
cd lambda/shared/cache && npm run build
cd lambda/shared/bedrock && npm run build
cd lambda/shared/circuit-breaker && npm run build

# Build WebSocket shared
cd lambda/websocket/shared && npm run build
```

## Deployment

The `dist/` directory contains everything needed for Lambda deployment:

```bash
# Create deployment package
cd dist
zip -r ../lambda.zip .

# Or use Terraform which handles this automatically
```

## Troubleshooting

### TypeScript rootDir Errors

If you see errors like:
```
File 'X' is not under 'rootDir' 'Y'
```

**Solution**: Remove `rootDir` from `tsconfig.json`. This allows TypeScript to compile imported files outside the src directory.

### Import Path Issues

If Lambda fails with module not found errors:

1. Check that shared modules are built (`lambda/shared/*/dist` exists)
2. Verify `build.mjs` copied modules to `dist/shared/`
3. Check import paths in `dist/index.mjs` are relative (start with `./`)

### Missing Dependencies

If Lambda fails with missing package errors:

1. Ensure `npm install` ran successfully
2. Verify `dist/node_modules/` exists and contains packages
3. Check `package.json` includes all required dependencies

## Why This Pattern?

This build pattern solves several challenges:

1. **ES Module Support** - Explicit `.mjs` extension ensures Node.js treats files as ES modules
2. **Shared Code** - Copies pre-built shared modules instead of bundling
3. **Type Safety** - TypeScript compilation with type checking
4. **Lambda Compatibility** - Self-contained dist/ with all dependencies
5. **Cross-Platform** - Node.js build script works on Windows, Mac, Linux
6. **No Bundler** - Avoids webpack/esbuild complexity for Lambda use case
