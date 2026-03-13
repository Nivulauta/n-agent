# Shared Libraries - Standard Build Pattern

## Overview

All shared libraries in `lambda/shared/` now follow a consistent build pattern for ES module support and Lambda deployment.

## Standard Build Pattern

### 1. TypeScript Configuration (`tsconfig.json`)

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ES2022",
        "lib": ["ES2022"],
        "moduleResolution": "node",
        "outDir": "./dist",
        "rootDir": "./src",
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true,
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 2. Package Configuration (`package.json`)

```json
{
    "name": "@chatbot/library-name",
    "version": "1.0.0",
    "type": "module",
    "main": "dist/index.mjs",
    "types": "dist/index.d.ts",
    "scripts": {
        "build": "node build.mjs",
        "test": "vitest run",
        "test:watch": "vitest"
    }
}
```

### 3. Build Script (`build.mjs`)

Standard Node.js script that:

1. **Compiles TypeScript** - Runs `tsc` to compile source files
2. **Renames Output** - Changes `.js` to `.mjs` for explicit ES modules
3. **Fixes Imports** - Updates import paths to use `.mjs` extensions

```javascript
#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building shared library...\n');

// Step 1: Compile TypeScript
console.log('🔨 Compiling TypeScript...');
execSync('tsc', { stdio: 'inherit', cwd: __dirname });

// Step 2: Rename .js to .mjs
console.log('\n📝 Renaming .js files to .mjs...');
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
    const files = readdirSync(distDir);
    for (const file of files) {
        if (file.endsWith('.js')) {
            const oldPath = join(distDir, file);
            const newPath = join(distDir, file.replace('.js', '.mjs'));
            renameSync(oldPath, newPath);
            console.log(`  ✅ ${file} → ${file.replace('.js', '.mjs')}`);
        }
    }
}

// Step 3: Fix import paths
console.log('\n🔧 Fixing import paths in .mjs files...');
if (existsSync(distDir)) {
    const files = readdirSync(distDir);
    for (const file of files) {
        if (file.endsWith('.mjs')) {
            const filePath = join(distDir, file);
            let content = readFileSync(filePath, 'utf-8');
            const originalContent = content;

            // Fix relative imports
            content = content.replace(/from ['"](\.\/.+?)['"];/g, (match, path) => {
                if (!path.endsWith('.mjs') && !path.endsWith('.js')) {
                    return `from '${path}.mjs';`;
                }
                return match;
            });

            // Fix .js to .mjs
            content = content.replace(/from ['"](\.\/.+)\.js['"]/g, "from '$1.mjs'");

            if (content !== originalContent) {
                writeFileSync(filePath, content, 'utf-8');
                console.log(`  ✅ Fixed imports in ${file}`);
            }
        }
    }
}

console.log('\n✅ Build complete!');
console.log('📁 Output: dist/*.mjs\n');
```

## Libraries Using This Pattern

All shared libraries now follow this pattern:

1. ✅ **rate-limiter** - Rate limiting with sliding window
2. ✅ **audit-logger** - CloudWatch structured logging
3. ✅ **chat-history** - DynamoDB chat persistence with encryption
4. ✅ **circuit-breaker** - Circuit breaker pattern for resilience
5. ✅ **query-router** - Query classification for RAG
6. ✅ **rag** - RAG orchestration with OpenSearch
7. ✅ **cache** - Redis caching layer
8. ✅ **bedrock** - Claude 3 Sonnet integration
9. ✅ **embeddings** - Bedrock Titan embedding generation
10. ✅ **vector-store** - OpenSearch k-NN vector search

## Build Commands

```bash
# Build a shared library
cd lambda/shared/<library-name>
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch
```

## Output Structure

Each library produces:

```
dist/
├── *.mjs                        # ES module files
├── *.d.ts                       # TypeScript declarations
├── *.d.ts.map                   # Declaration source maps
└── *.js.map                     # Source maps
```

## Lambda Integration

When Lambda functions use shared libraries, the Lambda build script:

1. **Copies Library** - Copies `dist/` to Lambda's `dist/shared/<library>/`
2. **Adds package.json** - Creates `{"type": "module"}` for ES module support
3. **Transforms Imports** - Rewrites import paths from source to local

**Example transformation:**

```typescript
// Source code
import { RateLimiter } from '../../../shared/rate-limiter/src/rate-limiter.js';

// Lambda dist
import { RateLimiter } from './shared/rate-limiter/rate-limiter.mjs';
```

## Benefits

1. **Consistency** - Same pattern across all libraries
2. **ES Module Support** - Explicit `.mjs` for Node.js
3. **Type Safety** - TypeScript with strict mode
4. **Modern JavaScript** - ES2022 features
5. **Cross-Platform** - Works on Windows, Mac, Linux
6. **No Bundler** - Simple, transparent build
7. **Source Maps** - Debugging support
8. **Fast Builds** - Direct TypeScript compilation

## Testing

All libraries include:
- Unit tests with Vitest
- Property-based tests where applicable
- Integration tests for complex logic
- 100% of critical paths covered

## Maintenance

When creating a new shared library:

1. Copy `build.mjs` from any existing library
2. Update `package.json` with library name
3. Use standard `tsconfig.json`
4. Follow the same directory structure
5. Run `npm run build` to verify

## Migration Checklist

For existing libraries not yet migrated:

- [ ] Update `tsconfig.json` to ES2022 modules
- [ ] Add `"type": "module"` to `package.json`
- [ ] Change main entry to `.mjs`
- [ ] Create `build.mjs` script
- [ ] Update build command to `node build.mjs`
- [ ] Test build output
- [ ] Verify Lambda integration
- [ ] Run all tests
- [ ] Update documentation
