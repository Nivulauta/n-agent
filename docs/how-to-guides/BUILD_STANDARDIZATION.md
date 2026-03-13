# Build Standardization Complete

## Changes Made

Updated the generate-embeddings Lambda build process to follow the standard pattern used across all Lambda functions in the project.

## Key Updates

### 1. package.json
- Changed `build` script from `tsc` to `node build.mjs` (standard pattern)
- Added `compile` script for TypeScript compilation
- Removed deprecated `build:lambda` script

### 2. build.mjs
- Updated to call `npm run compile` instead of `npm run build` to avoid circular dependency
- Added dist/package.json creation step to explicitly mark output as ES module
- Follows the same pattern as websocket/message and other Lambda functions

## Build Commands

```bash
# Standard build (used by Terraform and CI/CD)
npm run build

# TypeScript compilation only
npm run compile

# Run tests
npm run test
```

## Output Structure

```
dist/
├── index.mjs              # Main Lambda handler
├── index.d.mts            # TypeScript declarations
├── package.json           # ES module marker
├── node_modules/          # All dependencies
└── shared/                # Shared modules
    ├── embeddings/
    ├── vector-store/
    └── metrics/
```

## Terraform Integration

The Terraform module already uses the correct path:
```hcl
source_dir = "${path.root}/../lambda/document-processor/generate-embeddings/dist"
```

No Terraform changes required.

## Benefits

1. Consistent build process across all Lambda functions
2. Single command (`npm run build`) for complete build
3. Proper ES module support with explicit package.json
4. Ready for CI/CD pipeline integration
