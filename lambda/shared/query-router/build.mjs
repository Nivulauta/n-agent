#!/usr/bin/env node

/**
 * Build script for shared query-router library
 * Compiles TypeScript and renames .js to .mjs for ES modules
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building shared query-router library...\n');

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

            // Replace imports without extensions to include .mjs
            const originalContent = content;

            // Match: from './module' or from "./module"
            content = content.replace(/from ['"](\.\/.+?)['"];/g, (match, path) => {
                if (!path.endsWith('.mjs') && !path.endsWith('.js')) {
                    return `from '${path}.mjs';`;
                }
                return match;
            });

            // Match: export * from './module'
            content = content.replace(/export \* from ['"](\.\/.+?)['"];/g, (match, path) => {
                if (!path.endsWith('.mjs') && !path.endsWith('.js')) {
                    return `export * from '${path}.mjs';`;
                }
                return match;
            });

            // Replace .js imports with .mjs
            content = content.replace(/from ['"](\.\/.+)\.js['"]/g, "from '$1.mjs'");
            content = content.replace(/import\(['"](\.\/.+)\.js['"]\)/g, "import('$1.mjs')");

            if (content !== originalContent) {
                writeFileSync(filePath, content, 'utf-8');
                console.log(`  ✅ Fixed imports in ${file}`);
            }
        }
    }
}

console.log('\n✅ Build complete!');
console.log('📁 Output: dist/*.mjs\n');
