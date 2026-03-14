#!/usr/bin/env node

/**
 * Build script for init-index Lambda
 * Compiles TypeScript and prepares for Lambda deployment
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building init-index Lambda...\n');

// Step 1: Compile TypeScript
console.log('🔨 Compiling TypeScript...');
execSync('tsc', { stdio: 'inherit', cwd: __dirname });

// Step 2: Rename all .js files to .mjs in dist
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

// Step 3: Fix imports in .mjs files to reference .mjs instead of .js
console.log('\n🔧 Fixing import paths in .mjs files...');

if (existsSync(distDir)) {
    const files = readdirSync(distDir);

    for (const file of files) {
        if (file.endsWith('.mjs')) {
            const filePath = join(distDir, file);
            let content = readFileSync(filePath, 'utf-8');

            // Replace .js imports with .mjs
            const originalContent = content;
            content = content.replace(/from ['"](\.\/.+)\.js['"]/g, "from '$1.mjs'");
            content = content.replace(/import\(['"](\.\/.+)\.js['"]\)/g, "import('$1.mjs')");

            if (content !== originalContent) {
                writeFileSync(filePath, content, 'utf-8');
                console.log(`  ✅ Fixed imports in ${file}`);
            }
        }
    }
}

// Step 4: Copy node_modules to dist
console.log('\n📦 Copying node_modules to dist...');
const nodeModulesSource = join(__dirname, 'node_modules');
const nodeModulesDest = join(distDir, 'node_modules');

if (existsSync(nodeModulesSource)) {
    cpSync(nodeModulesSource, nodeModulesDest, { recursive: true });
    console.log('  ✅ Copied node_modules');
}

// Step 5: Create package.json in dist for ES module support
console.log('\n📝 Creating package.json in dist...');
const packageJson = { type: 'module' };
writeFileSync(join(distDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8');
console.log('  ✅ Created package.json');

console.log('\n✅ Build complete!');
console.log('📁 Output: dist/*.mjs\n');
