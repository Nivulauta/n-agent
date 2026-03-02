#!/bin/bash

# Build script for Lambda functions
# This script builds all Lambda functions and shared libraries for deployment

set -e

echo "=========================================="
echo "Building Lambda Functions and Shared Libraries"
echo "=========================================="
echo ""

# Function to build a TypeScript Lambda function
build_lambda() {
    local lambda_dir=$1
    local lambda_name=$2
    
    echo "Building $lambda_name..."
    cd "$lambda_dir"
    
    # Clean dist directory
    rm -rf dist
    mkdir -p dist
    
    # Install ALL dependencies (including dev dependencies for TypeScript compilation)
    npm install
    
    # Build TypeScript (this will output to dist/)
    npm run build
    
    # Rename .js files to .mjs for ES modules
    echo "  Renaming .js files to .mjs..."
    find dist -name "*.js" -type f -exec sh -c 'mv "$1" "${1%.js}.mjs"' _ {} \;
    
    # Remove existing node_modules and reinstall only production dependencies
    rm -rf node_modules
    npm install --omit=dev
    
    # Copy production node_modules to dist for Lambda deployment
    echo "  Copying production node_modules to dist..."
    cp -r node_modules dist/
    
    echo "  ✓ $lambda_name built successfully"
    cd - > /dev/null
}

# Function to build a shared TypeScript library
build_shared_library() {
    local lib_dir=$1
    local lib_name=$2
    
    echo "Building shared library: $lib_name..."
    cd "$lib_dir"
    
    # Clean dist directory
    rm -rf dist
    mkdir -p dist
    
    # Install dependencies
    npm install
    
    # Build TypeScript
    npm run build
    
    # # Rename .js files to .mjs for ES modules
    # echo "  Renaming .js files to .mjs..."
    # find dist -name "*.js" -type f -exec sh -c 'mv "$1" "${1%.js}.mjs"' _ {} \;
    
    echo "  ✓ $lib_name built successfully"
    cd - > /dev/null
}

# Function to build Python Lambda with dependencies
build_python_lambda() {
    local lambda_dir=$1
    local lambda_name=$2
    
    echo "Building $lambda_name (Python)..."
    cd "$lambda_dir"
    
    # Check if build_layer_docker.sh exists
    if [ -f "build_layer_docker.sh" ]; then
        echo "  Building Lambda layer using Docker..."
        bash build_layer_docker.sh
    else
        echo "  ✓ $lambda_name ready (no layer build needed)"
    fi
    
    echo "  ✓ $lambda_name built successfully"
    cd - > /dev/null
}

echo "=== Building Shared Libraries ==="
echo ""

# Build shared libraries (these are used by multiple Lambda functions)
if [ -d "shared/audit-logger" ]; then
    build_shared_library "shared/audit-logger" "Audit Logger"
fi

if [ -d "shared/bedrock" ]; then
    build_shared_library "shared/bedrock" "Bedrock Service"
fi

if [ -d "shared/cache" ]; then
    build_shared_library "shared/cache" "Cache Layer"
fi

if [ -d "shared/embeddings" ]; then
    build_shared_library "shared/embeddings" "Embedding Generator"
fi

if [ -d "shared/rate-limiter" ]; then
    build_shared_library "shared/rate-limiter" "Rate Limiter"
fi

if [ -d "shared/vector-store" ]; then
    build_shared_library "shared/vector-store" "Vector Store Client"
fi

echo ""
echo "=== Building Auth Lambda Functions ==="
echo ""

# Build all auth Lambda functions
if [ -d "auth/authorizer" ]; then
    build_lambda "auth/authorizer" "Lambda Authorizer"
fi

if [ -d "auth/login" ]; then
    build_lambda "auth/login" "Login Lambda"
fi

if [ -d "auth/logout" ]; then
    build_lambda "auth/logout" "Logout Lambda"
fi

echo ""
echo "=== Building WebSocket Lambda Functions ==="
echo ""

# Build WebSocket shared utilities first
if [ -d "websocket/shared" ]; then
    echo "Building WebSocket shared utilities..."
    cd websocket/shared
    npm install
    npm run build
    # Rename .js to .mjs
    find dist -name "*.js" -type f -exec sh -c 'mv "$1" "${1%.js}.mjs"' _ {} \;
    echo "  ✓ WebSocket shared utilities built successfully"
    cd - > /dev/null
fi

# Build WebSocket handlers
if [ -d "websocket/connect" ]; then
    build_lambda "websocket/connect" "WebSocket Connect Handler"
fi

if [ -d "websocket/disconnect" ]; then
    build_lambda "websocket/disconnect" "WebSocket Disconnect Handler"
fi

if [ -d "websocket/message" ]; then
    build_lambda "websocket/message" "WebSocket Message Handler"
fi

echo ""
echo "=== Building Vector Store Lambda Functions ==="
echo ""

# Build vector store Lambda functions
if [ -d "vector-store/init-index" ]; then
    build_lambda "vector-store/init-index" "Vector Store Init Index"
fi

if [ -d "vector-store/configure-access" ]; then
    build_lambda "vector-store/configure-access" "Vector Store Configure Access"
fi

echo ""
echo "=== Building Document Management Lambda Functions ==="
echo ""

# Build document management Lambda functions
if [ -d "documents/upload" ]; then
    build_lambda "documents/upload" "Document Upload Handler"
fi

if [ -d "documents/list" ]; then
    build_lambda "documents/list" "Document List Handler"
fi

if [ -d "documents/delete" ]; then
    build_lambda "documents/delete" "Document Delete Handler"
fi

echo ""
echo "=== Building Document Processor Lambda Functions ==="
echo ""

# Build document processor Lambda functions (Python)
if [ -d "document-processor/extract-text" ]; then
    build_python_lambda "document-processor/extract-text" "Document Processor (Extract Text)"
fi

# Build embedding generator (TypeScript)
if [ -d "document-processor/generate-embeddings" ]; then
    echo "Building Embedding Generator Lambda..."
    cd document-processor/generate-embeddings
    
    # Use the custom build script if it exists
    if [ -f "build.sh" ]; then
        bash build.sh
    else
        # Fallback to standard build
        build_lambda "." "Embedding Generator"
    fi
    
    echo "  ✓ Embedding Generator Lambda built successfully"
    cd - > /dev/null
fi

echo ""
echo "=========================================="
echo "Build Summary"
echo "=========================================="
echo ""
echo "✓ Shared Libraries:"
echo "    - Audit Logger"
echo "    - Bedrock Service"
echo "    - Cache Layer"
echo "    - Embedding Generator"
echo "    - Rate Limiter"
echo "    - Vector Store Client"
echo ""
echo "✓ Auth Functions:"
echo "    - Lambda Authorizer"
echo "    - Login Lambda"
echo "    - Logout Lambda"
echo ""
echo "✓ WebSocket Functions:"
echo "    - WebSocket Shared Utilities"
echo "    - Connect Handler"
echo "    - Disconnect Handler"
echo "    - Message Handler"
echo ""
echo "✓ Vector Store Functions:"
echo "    - Init Index Lambda"
echo "    - Configure Access Lambda"
echo ""
echo "✓ Document Management Functions:"
echo "    - Upload Handler Lambda"
echo "    - List Handler Lambda"
echo "    - Delete Handler Lambda"
echo ""
echo "✓ Document Processor Functions:"
echo "    - Extract Text Lambda (Python)"
echo "    - Generate Embeddings Lambda (TypeScript)"
echo ""
echo "=========================================="
echo "All Lambda functions built successfully!"
echo "=========================================="
echo ""
echo "Ready for Terraform deployment. Terraform will automatically package:"
echo "  Auth Functions:"
echo "    - lambda/auth/authorizer/dist/"
echo "    - lambda/auth/login/dist/"
echo "    - lambda/auth/logout/dist/"
echo "  WebSocket Functions:"
echo "    - lambda/websocket/connect/dist/"
echo "    - lambda/websocket/disconnect/dist/"
echo "    - lambda/websocket/message/dist/"
echo "  Vector Store Functions:"
echo "    - lambda/vector-store/init-index/dist/"
echo "    - lambda/vector-store/configure-access/dist/"
echo "  Document Management Functions:"
echo "    - lambda/documents/upload/dist/"
echo "    - lambda/documents/list/dist/"
echo "    - lambda/documents/delete/dist/"
echo "  Document Processor Functions:"
echo "    - lambda/document-processor/extract-text/"
echo "    - lambda/document-processor/generate-embeddings/dist/"
echo ""
echo "To deploy: cd ../terraform && terraform apply"
echo ""
