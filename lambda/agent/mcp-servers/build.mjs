#!/usr/bin/env node

/**
 * Build script for MCP Servers Management Lambda
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building MCP Servers Management Lambda...\n');

// Step 1: Clean dist directory
console.log('🧹 Cleaning dist directory...');
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });

// Step 2: Install dependencies
console.log('\n📦 Installing dependencies...');
execSync('npm install', { stdio: 'inherit', cwd: __dirname });

// Step 3: Build TypeScript
console.log('\n🔨 Compiling TypeScript...');
execSync('npx tsc', { stdio: 'inherit', cwd: __dirname });

// Step 4: Rename index.js to index.mjs for explicit ES module
console.log('\n📝 Renaming index.js to index.mjs...');
const indexJsPath = join(__dirname, 'dist', 'agent', 'mcp-servers', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');

if (existsSync(indexJsPath)) {
    cpSync(indexJsPath, indexMjsPath);
    console.log('✅ Created index.mjs');

    const nestedDir = join(__dirname, 'dist', 'agent');
    if (existsSync(nestedDir)) {
        rmSync(nestedDir, { recursive: true, force: true });
    }
}

// Step 5: Copy shared mcp-registry module
console.log('\n📋 Copying shared mcp-registry module...');
const registrySource = join(__dirname, '..', '..', 'shared', 'mcp-registry', 'dist');
const registryDest = join(__dirname, 'dist', 'shared', 'mcp-registry');

if (existsSync(registrySource)) {
    mkdirSync(registryDest, { recursive: true });
    cpSync(registrySource, registryDest, { recursive: true });

    const registryPackageJson = join(registryDest, 'package.json');
    if (!existsSync(registryPackageJson)) {
        writeFileSync(registryPackageJson, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');
    }
}

// Step 6: Fix import paths in index.mjs
console.log('\n🔧 Fixing import paths in index.mjs...');
let indexContent = readFileSync(indexMjsPath, 'utf-8');

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-registry\/src\/registry\.js['"]/g,
    "from './shared/mcp-registry/registry.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-registry\/src\/types\.js['"]/g,
    "from './shared/mcp-registry/types.mjs'"
);

writeFileSync(indexMjsPath, indexContent, 'utf-8');

// Step 7: Copy node_modules to dist
console.log('\n📋 Copying node_modules to dist...');
const nodeModulesSource = join(__dirname, 'node_modules');
const nodeModulesDest = join(__dirname, 'dist', 'node_modules');

if (existsSync(nodeModulesDest)) {
    rmSync(nodeModulesDest, { recursive: true, force: true });
}

cpSync(nodeModulesSource, nodeModulesDest, { recursive: true });

console.log('\n✅ Build complete!');
console.log('📁 Output: dist/index.mjs');
console.log('📦 Dependencies: dist/node_modules/');
console.log('🔗 Shared modules: dist/shared/');
