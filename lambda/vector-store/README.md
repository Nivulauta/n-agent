# Vector Store Lambda Functions

Lambda functions for OpenSearch vector store initialization and configuration.

## Functions

### 1. init-index
Creates the OpenSearch `documents` index with k-NN configuration.

**Location:** `lambda/vector-store/init-index/`

**Purpose:**
- Creates index with 1024-dimension vector field
- Configures HNSW algorithm for k-NN search
- Sets up metadata fields for document tracking

**Documentation:** [init-index/README.md](init-index/README.md)

### 2. configure-access
Configures OpenSearch role mapping for Lambda IAM roles.

**Location:** `lambda/vector-store/configure-access/`

**Purpose:**
- Maps Lambda IAM roles to OpenSearch roles
- Enables IAM authentication for Lambda functions
- Runs inside VPC to access private OpenSearch

**Documentation:** [configure-access/README.md](configure-access/README.md)

## Quick Start

### Build All Functions

```bash
cd lambda/vector-store
bash build-all.sh
```

### Verify Setup

```bash
bash verify-setup.sh
```

### Deploy and Configure

```bash
cd ../../terraform
terraform apply
bash scripts/configure_opensearch_access.sh
```

## Build Scripts

| Script | Purpose |
|--------|---------|
| `build-all.sh` | Build both Lambda functions |
| `verify-setup.sh` | Verify setup is correct |
| `init-index/build-for-terraform.sh` | Build init-index Lambda |
| `configure-access/build-for-terraform.sh` | Build configure-access Lambda |

## Package.json Scripts

Both Lambda functions have these npm scripts:

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript only |
| `build:terraform` | `bash build-for-terraform.sh` | Build for Terraform deployment |
| `test` | `vitest run` | Run tests |
| `test:watch` | `vitest` | Run tests in watch mode |
| `clean` | `rm -rf dist node_modules` | Clean build artifacts |

## Build Process

The `build:terraform` script:

1. **Installs dependencies** - `npm install`
2. **Compiles TypeScript** - `tsc` compiles `.ts` to `.js`
3. **Copies node_modules** - Copies dependencies to `dist/`
4. **Verifies output** - Checks that `dist/index.js` exists

### Why Copy node_modules?

Lambda needs dependencies at runtime. Terraform's `archive_file` creates a zip from `dist/`, so everything must be in there:

```
dist/
├── index.js          # Compiled code
├── index.d.ts        # Type definitions
├── index.js.map      # Source maps
└── node_modules/     # Dependencies (REQUIRED!)
    ├── @opensearch-project/
    ├── aws-sdk/
    └── ...
```

## Troubleshooting

### "Cannot find module" Error

Dependencies not included in build. Run:

```bash
npm run build:terraform
```

NOT just `npm run build` (which only compiles TypeScript).

### "build:terraform script not found"

The package.json is missing the script. It should have:

```json
{
  "scripts": {
    "build:terraform": "bash build-for-terraform.sh"
  }
}
```

### Build Script Not Found

The `build-for-terraform.sh` file is missing. Check that it exists in the Lambda directory.

### Clean Build

If you encounter issues:

```bash
npm run clean
npm run build:terraform
```

## Directory Structure

```
lambda/vector-store/
├── init-index/
│   ├── src/
│   │   └── index.ts
│   ├── dist/                    # Build output
│   │   ├── index.js
│   │   └── node_modules/        # Copied by build script
│   ├── package.json
│   ├── tsconfig.json
│   └── build-for-terraform.sh
├── configure-access/
│   ├── src/
│   │   └── index.ts
│   ├── dist/                    # Build output
│   │   ├── index.js
│   │   └── node_modules/        # Copied by build script
│   ├── package.json
│   ├── tsconfig.json
│   └── build-for-terraform.sh
├── build-all.sh                 # Build both functions
├── verify-setup.sh              # Verify setup
├── BUILD.md                     # Detailed build guide
├── QUICK_START.md               # Quick reference
└── README.md                    # This file
```

## Documentation

- [QUICK_START.md](QUICK_START.md) - Quick reference guide
- [BUILD.md](BUILD.md) - Detailed build instructions
- [init-index/README.md](init-index/README.md) - Init index Lambda docs
- [configure-access/README.md](configure-access/README.md) - Configure access Lambda docs
- [configure-access/BUILD_FIX.md](configure-access/BUILD_FIX.md) - Fix for module errors

## Deployment Documentation

- [../../terraform/OPENSEARCH_SETUP.md](../../terraform/OPENSEARCH_SETUP.md) - Setup guide
- [../../terraform/modules/vector-store-init/DEPLOYMENT_GUIDE.md](../../terraform/modules/vector-store-init/DEPLOYMENT_GUIDE.md) - Full deployment guide
- [../../terraform/modules/vector-store-init/TROUBLESHOOTING.md](../../terraform/modules/vector-store-init/TROUBLESHOOTING.md) - Troubleshooting

## Architecture

```
Developer
    ↓
build-all.sh
    ↓
┌─────────────────────────────────────┐
│  Lambda Functions (Built)           │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ init-index   │  │ configure-  │ │
│  │              │  │ access      │ │
│  │ dist/        │  │ dist/       │ │
│  │ ├─ index.js  │  │ ├─ index.js │ │
│  │ └─ node_mod/ │  │ └─ node_mod/│ │
│  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────┘
    ↓
Terraform (archive_file)
    ↓
┌─────────────────────────────────────┐
│  AWS Lambda (Deployed)              │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ Configure    │→ │ OpenSearch  │ │
│  │ Access       │  │ (VPC)       │ │
│  │ Lambda       │  │             │ │
│  └──────────────┘  └─────────────┘ │
│         ↓                           │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ Vector Store │→ │ OpenSearch  │ │
│  │ Init Lambda  │  │ Index       │ │
│  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────┘
```

## Requirements

- Node.js >= 22
- npm or yarn
- TypeScript
- Bash (for build scripts)

## Development

### Install Dependencies

```bash
cd init-index
npm install

cd ../configure-access
npm install
```

### Run Tests

```bash
cd init-index
npm test

cd ../configure-access
npm test
```

### Local Development

For local testing (without Terraform):

```bash
npm run build
node dist/index.js
```

For Terraform deployment:

```bash
npm run build:terraform
```

## CI/CD

For continuous integration:

```bash
#!/bin/bash
set -e

cd lambda/vector-store

# Verify setup
bash verify-setup.sh

# Build all functions
bash build-all.sh

# Run tests
cd init-index && npm test
cd ../configure-access && npm test
```

## License

See main project LICENSE file.
