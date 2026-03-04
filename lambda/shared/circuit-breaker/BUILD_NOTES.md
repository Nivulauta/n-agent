# Circuit Breaker Library - Build Configuration

## Build Pattern

This shared library now uses the same build pattern as other shared libraries (rate-limiter, audit-logger, chat-history, etc.) for consistent ES module handling.

## Build Process

### 1. TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true
  }
}
```

### 2. Build Script (`build.mjs`)

Cross-platform Node.js script that:

1. **Compiles TypeScript** - `tsc` compiles to JavaScript
2. **Renames files** - `.js` → `.mjs` for explicit ES module support
3. **Fixes imports** - Updates import paths to use `.mjs` extensions

### 3. Package Configuration (`package.json`)

```json
{
  "type": "module",
  "main": "dist/circuit-breaker.mjs",
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
├── circuit-breaker.mjs          # Main module (ES module)
├── circuit-breaker.d.ts         # TypeScript declarations
├── circuit-breaker.d.ts.map     # Declaration source map
└── circuit-breaker.js.map       # Source map
```

## Usage in Lambda Functions

When used in Lambda functions (like WebSocket message handler), the build script:

1. Copies `dist/` contents to Lambda's `dist/shared/circuit-breaker/`
2. Adds `package.json` with `{"type": "module"}` for ES module support
3. Transforms imports from source paths to local paths

**Source import:**
```typescript
import { CircuitBreaker } from '../../../shared/circuit-breaker/src/circuit-breaker.js';
```

**Lambda dist import:**
```javascript
import { CircuitBreaker } from './shared/circuit-breaker/circuit-breaker.mjs';
```

## Why This Pattern?

This build pattern provides:

1. **Consistency** - Same pattern across all shared libraries
2. **ES Module Support** - Explicit `.mjs` extension for Node.js
3. **Type Safety** - TypeScript compilation with type checking
4. **Source Maps** - Debugging support with source maps
5. **Cross-Platform** - Node.js build script works everywhere
6. **No Bundler** - Simple, transparent build process

## Integration with Other Libraries

The circuit-breaker library is used by:

- **WebSocket Message Handler** - Protects Bedrock, Vector Store, and Cache services
- **Future Lambda Functions** - Can be used anywhere circuit breaker pattern is needed

## Testing

All 15 tests pass:

- Circuit state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- Failure threshold enforcement (5 failures)
- Success threshold enforcement (2 successes in HALF_OPEN)
- Timeout behavior (60 seconds default)
- Statistics tracking
- Custom configuration options

## Comparison with Previous Build

**Before:**
- Direct `tsc` compilation
- Output: `circuit-breaker.js`
- No import path transformation

**After:**
- Build script with `tsc` + renaming + import fixing
- Output: `circuit-breaker.mjs`
- Import paths transformed for Lambda usage
- Consistent with other shared libraries
