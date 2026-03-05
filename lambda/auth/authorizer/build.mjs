#!/usr/bin/env node

/**
 * Build script for Lambda Authorizer
 * Compiles TypeScript and bundles dependencies
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, 'dist');

console.log('🔨 Building Lambda Authorizer...\n');

// Step 1: Clean dist directory
console.log('1️⃣  Cleaning dist directory...');
if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });
console.log('   ✓ Cleaned\n');

// Step 2: Compile TypeScript
console.log('2️⃣  Compiling TypeScript...');
try {
    execSync('tsc', { stdio: 'inherit', cwd: __dirname });
    console.log('   ✓ Compiled\n');
} catch (error) {
    console.error('   ✗ TypeScript compilation failed');
    process.exit(1);
}

// Step 2.5: Rename .js to .mjs
console.log('2.5️⃣ Renaming .js to .mjs...');
try {
    const indexJs = join(DIST_DIR, 'index.js');
    const indexMjs = join(DIST_DIR, 'index.mjs');

    if (existsSync(indexJs)) {
        copyFileSync(indexJs, indexMjs);
        rmSync(indexJs);
        console.log('   ✓ Renamed index.js to index.mjs\n');
    } else {
        console.log('   ⚠ index.js not found\n');
    }
} catch (error) {
    console.error('   ✗ Failed to rename file');
    console.error(error.message);
    process.exit(1);
}

// Step 3: Copy node_modules
console.log('3️⃣  Copying node_modules...');
try {
    // Copy only production dependencies
    const nodeModulesSource = join(__dirname, 'node_modules');
    const nodeModulesDest = join(DIST_DIR, 'node_modules');

    if (existsSync(nodeModulesSource)) {
        // Use system copy command for better performance
        if (process.platform === 'win32') {
            execSync(`xcopy "${nodeModulesSource}" "${nodeModulesDest}" /E /I /Q /Y`, { stdio: 'inherit' });
        } else {
            execSync(`cp -r "${nodeModulesSource}" "${nodeModulesDest}"`, { stdio: 'inherit' });
        }
        console.log('   ✓ Copied node_modules\n');
    } else {
        console.log('   ⚠ node_modules not found, skipping\n');
    }
} catch (error) {
    console.error('   ✗ Failed to copy node_modules');
    console.error(error.message);
    process.exit(1);
}

// Step 4: Copy package.json
console.log('4️⃣  Copying package.json...');
try {
    copyFileSync(
        join(__dirname, 'package.json'),
        join(DIST_DIR, 'package.json')
    );
    console.log('   ✓ Copied\n');
} catch (error) {
    console.error('   ✗ Failed to copy package.json');
    process.exit(1);
}

console.log('✅ Build complete!\n');
console.log(`📦 Output: ${DIST_DIR}`);
