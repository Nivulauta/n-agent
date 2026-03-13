# Source Directory Build Artifacts Fix

## Problem
TypeScript was outputting build artifacts (.js, .d.ts, .js.map, .d.ts.map files) into src directories alongside source .ts files. This happened when:

1. Running `tsc` directly instead of using the build.mjs scripts
2. TypeScript configurations without proper `outDir` enforcement
3. Build artifacts not being properly ignored by git

## Root Cause
When TypeScript compiles files that import from outside their `rootDir`, it can create build artifacts in the source directories if:
- `outDir` is set but `rootDir` is not constrained
- Someone runs `tsc` directly without going through the build script
- The tsconfig allows compilation of files outside the intended source tree

## Solution

### 1. Cleaned All Build Artifacts from src Directories
Removed all .js, .d.ts, .js.map, and .d.ts.map files from src directories:
- `lambda/shared/*/src/` - All shared libraries
- `lambda/websocket/shared/src/` - WebSocket shared
- Any other src directories

Total files removed: ~60+ build artifacts

### 2. Updated .gitignore
Added patterns to prevent build artifacts in src directories from being tracked:

```gitignore
# TypeScript build artifacts in src directories
**/src/**/*.js
**/src/**/*.d.ts
**/src/**/*.js.map
**/src/**/*.d.ts.map
!**/src/**/*.test.js
!**/src/**/*.config.js
```

This ignores all JavaScript build artifacts in src directories while allowing:
- Test files (*.test.js)
- Config files (*.config.js)

### 3. Standardized Build Process
All modules now use build.mjs scripts that:
1. Run `tsc` to compile TypeScript
2. Output to `dist/` directory only
3. Rename .js to .mjs for ES modules
4. Fix import paths
5. Copy dependencies as needed

## Prevention

### Always Use Build Scripts
```bash
# ✅ Correct - uses build.mjs
npm run build

# ❌ Wrong - bypasses build script, may create artifacts in src
tsc
```

### Build Script Pattern
All build scripts follow this pattern:
```javascript
// Step 1: Compile TypeScript
execSync('npm run compile', { stdio: 'inherit', cwd: __dirname });
// or
execSync('tsc', { stdio: 'inherit', cwd: __dirname });

// Step 2: Process output in dist/ directory only
// Never touch src/ directory
```

### TypeScript Configuration
All tsconfig.json files have:
```json
{
  "compilerOptions": {
    "outDir": "./dist",  // All output goes here
    // No rootDir constraint for files that import from outside
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Verification

Check for build artifacts in src:
```bash
# PowerShell
Get-ChildItem -Path . -Recurse -Filter "*.js" | Where-Object { 
  $_.DirectoryName -like "*\src" -and 
  $_.DirectoryName -notlike "*\node_modules\*" -and 
  $_.DirectoryName -notlike "*\dist\*" 
}

# Should return no results
```

## Clean Source Structure

All src directories now contain only:
- `*.ts` - TypeScript source files
- `*.test.ts` - Test files
- No build artifacts

Example:
```
lambda/shared/rag/src/
├── rag.ts           ✅ Source
├── types.ts         ✅ Source
└── index.ts         ✅ Source
# No .js, .d.ts, .js.map, or .d.ts.map files
```

## Build Output Structure

All build artifacts go to dist:
```
lambda/shared/rag/dist/
├── rag.mjs          ✅ Build output
├── rag.d.ts         ✅ Declarations
├── types.mjs        ✅ Build output
├── types.d.ts       ✅ Declarations
└── embeddings/      ✅ Copied dependencies
```

## Benefits

1. **Clean separation**: Source and build artifacts never mix
2. **Version control**: No build artifacts tracked in git
3. **Consistency**: All modules follow the same pattern
4. **Clarity**: Easy to see what's source vs. generated
5. **Safety**: .gitignore prevents accidental commits of build artifacts

## Date
March 3, 2026
