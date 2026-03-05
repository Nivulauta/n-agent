#!/usr/bin/env node

/**
 * Build script for Login Lambda
 * Cross-platform Node.js build script that handles ES modules properly
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building Login Lambda...\n');

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
const indexJsPath = join(__dirname, 'dist', 'auth', 'login', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');

if (existsSync(indexJsPath)) {
    cpSync(indexJsPath, indexMjsPath);
    console.log('✅ Created index.mjs');

    // Clean up nested structure
    const nestedDir = join(__dirname, 'dist', 'auth');
    if (existsSync(nestedDir)) {
        rmSync(nestedDir, { recursive: true, force: true });
    }
}

// Step 5: Copy shared audit-logger module
console.log('\n📋 Copying shared audit-logger module...');
const auditLoggerSource = join(__dirname, '..', '..', 'shared', 'audit-logger', 'dist');
const auditLoggerDest = join(__dirname, 'dist', 'shared', 'audit-logger');

if (existsSync(auditLoggerSource)) {
    mkdirSync(auditLoggerDest, { recursive: true });
    cpSync(auditLoggerSource, auditLoggerDest, { recursive: true });

    // Ensure package.json exists for ES module support
    const auditLoggerPackageJson = join(auditLoggerDest, 'package.json');
    if (!existsSync(auditLoggerPackageJson)) {
        writeFileSync(auditLoggerPackageJson, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');
    }
}

// Step 6: Fix import paths in index.mjs
console.log('\n🔧 Fixing import paths in index.mjs...');
let indexContent = readFileSync(indexMjsPath, 'utf-8');

// Replace relative paths to shared modules with local paths
indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/audit-logger\/src\/audit-logger\.js['"]/g,
    "from './shared/audit-logger/audit-logger.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/audit-logger\/src\/types\.js['"]/g,
    "from './shared/audit-logger/types.mjs'"
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
