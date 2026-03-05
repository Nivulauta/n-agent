#!/usr/bin/env node

/**
 * Build script for Document List Lambda
 * Cross-platform Node.js build script that handles ES modules properly
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building Document List Lambda...\n');

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
const indexJsPath = join(__dirname, 'dist', 'documents', 'list', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');

if (existsSync(indexJsPath)) {
    cpSync(indexJsPath, indexMjsPath);
    console.log('✅ Created index.mjs');

    // Clean up nested structure
    const nestedDir = join(__dirname, 'dist', 'documents');
    if (existsSync(nestedDir)) {
        rmSync(nestedDir, { recursive: true, force: true });
    }
}

// Step 5: Copy node_modules to dist
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
