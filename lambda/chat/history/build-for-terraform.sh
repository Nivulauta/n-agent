#!/bin/bash

# Build script for Chat History Lambda
# This script now delegates to the cross-platform Node.js build script

set -e

echo "Building Chat History Lambda..."
echo "Using Node.js build script for cross-platform compatibility..."

node build.mjs

echo ""
echo "Creating deployment package..."
cd dist
zip -r lambda-chat-history.zip . -q
cd ..

echo ""
echo "✅ Build complete!"
echo "📦 Deployment package: dist/lambda-chat-history.zip"
echo "📏 Package size: $(du -h dist/lambda-chat-history.zip | cut -f1)"
