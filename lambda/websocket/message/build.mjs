#!/usr/bin/env node

/**
 * Build script for WebSocket Message Handler Lambda
 * Cross-platform Node.js build script that handles ES modules properly
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building WebSocket Message Handler Lambda...\n');

// Step 1: Clean dist folder
console.log('🧹 Cleaning dist folder...');
const distPath = join(__dirname, 'dist');
if (existsSync(distPath)) {
    rmSync(distPath, { recursive: true, force: true });
}
mkdirSync(distPath, { recursive: true });
console.log('✅ Cleaned dist folder');

// Step 2: Install dependencies
console.log('\n📦 Installing dependencies...');
execSync('npm install', { stdio: 'inherit', cwd: __dirname });

// Step 3: Build TypeScript
console.log('\n🔨 Compiling TypeScript...');
execSync('npm run compile', { stdio: 'inherit', cwd: __dirname });

// Step 4: Rename index.js to index.mjs for explicit ES module
console.log('\n📝 Renaming index.js to index.mjs...');
const indexJsPath = join(__dirname, 'dist', 'websocket', 'message', 'src', 'index.js');
const indexMjsPath = join(__dirname, 'dist', 'index.mjs');

if (existsSync(indexJsPath)) {
    renameSync(indexJsPath, indexMjsPath);
    console.log('✅ Renamed index.js → index.mjs');

    // Clean up the websocket folder structure
    const websocketDir = join(__dirname, 'dist', 'websocket');
    if (existsSync(websocketDir)) {
        rmSync(websocketDir, { recursive: true, force: true });
        console.log('✅ Cleaned up websocket folder structure');
    }
} else {
    console.error('❌ index.js not found at expected location');
    process.exit(1);
}

// Step 5: Copy node_modules to dist
console.log('\n📋 Copying node_modules to dist...');
const nodeModulesSource = join(__dirname, 'node_modules');
const nodeModulesDest = join(__dirname, 'dist', 'node_modules');

if (existsSync(nodeModulesDest)) {
    rmSync(nodeModulesDest, { recursive: true, force: true });
}

cpSync(nodeModulesSource, nodeModulesDest, { recursive: true });

// Step 6: Copy shared modules
console.log('\n📋 Copying shared modules...');

const sharedModules = [
    'rate-limiter',
    'audit-logger',
    'chat-history',
    'query-router',
    'rag',
    'cache',
    'bedrock',
    'circuit-breaker',
    'metrics',
    'inline-agent',
    'mcp-registry',
    'mcp-bridge'
];

for (const moduleName of sharedModules) {
    const moduleSource = join(__dirname, '..', '..', 'shared', moduleName, 'dist');
    const moduleDest = join(__dirname, 'dist', 'shared', moduleName);

    if (existsSync(moduleSource)) {
        mkdirSync(moduleDest, { recursive: true });
        cpSync(moduleSource, moduleDest, { recursive: true });
        console.log(`✅ Copied shared/${moduleName}`);

        // Ensure package.json exists for ES module support
        const modulePackageJson = join(moduleDest, 'package.json');
        if (!existsSync(modulePackageJson)) {
            writeFileSync(modulePackageJson, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');
        }
    } else {
        console.warn(`⚠️  Warning: shared/${moduleName}/dist not found, skipping...`);
    }
}

// Step 7: Copy WebSocket shared module
console.log('\n📋 Copying WebSocket shared module...');
const wsSharedSource = join(__dirname, '..', 'shared', 'dist');
const wsSharedDest = join(__dirname, 'dist', 'websocket-shared');

if (existsSync(wsSharedSource)) {
    mkdirSync(wsSharedDest, { recursive: true });
    cpSync(wsSharedSource, wsSharedDest, { recursive: true });
    console.log('✅ Copied websocket/shared');

    // Ensure package.json exists for ES module support
    const wsSharedPackageJson = join(wsSharedDest, 'package.json');
    if (!existsSync(wsSharedPackageJson)) {
        writeFileSync(wsSharedPackageJson, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');
    }
} else {
    console.warn('⚠️  Warning: websocket/shared/dist not found, skipping...');
}

// Step 8: Fix import paths in index.mjs
console.log('\n🔧 Fixing import paths in index.mjs...');
let indexContent = readFileSync(indexMjsPath, 'utf-8');

// Replace relative paths to shared modules with local paths
indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/rate-limiter\/src\/rate-limiter\.js['"]/g,
    "from './shared/rate-limiter/rate-limiter.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/rate-limiter\/src\/types\.js['"]/g,
    "from './shared/rate-limiter/types.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/audit-logger\/src\/audit-logger\.js['"]/g,
    "from './shared/audit-logger/audit-logger.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/chat-history\/src\/chat-history\.js['"]/g,
    "from './shared/chat-history/chat-history.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/query-router\/src\/classifier\.js['"]/g,
    "from './shared/query-router/classifier.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/rag\/src\/rag\.js['"]/g,
    "from './shared/rag/rag.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/cache\/src\/cache\.js['"]/g,
    "from './shared/cache/cache.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/bedrock\/src\/bedrock\.js['"]/g,
    "from './shared/bedrock/bedrock.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/circuit-breaker\/src\/circuit-breaker\.js['"]/g,
    "from './shared/circuit-breaker/circuit-breaker.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/shared\/src\/message-sender\.js['"]/g,
    "from './websocket-shared/message-sender.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/shared\/src\/types\.js['"]/g,
    "from './websocket-shared/types.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/metrics\/dist\/index\.mjs['"]/g,
    "from './shared/metrics/index.mjs'"
);

// Inline Agent imports
indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/inline-agent\/src\/inline-agent\.js['"]/g,
    "from './shared/inline-agent/inline-agent.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/inline-agent\/src\/instruction-builder\.js['"]/g,
    "from './shared/inline-agent/instruction-builder.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/inline-agent\/src\/builtin-tools\.js['"]/g,
    "from './shared/inline-agent/builtin-tools.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/inline-agent\/src\/types\.js['"]/g,
    "from './shared/inline-agent/types.mjs'"
);

// MCP Registry imports
indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-registry\/src\/registry\.js['"]/g,
    "from './shared/mcp-registry/registry.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-registry\/src\/types\.js['"]/g,
    "from './shared/mcp-registry/types.mjs'"
);

// MCP Bridge imports
indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-bridge\/src\/bridge\.js['"]/g,
    "from './shared/mcp-bridge/bridge.mjs'"
);

indexContent = indexContent.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/shared\/mcp-bridge\/src\/types\.js['"]/g,
    "from './shared/mcp-bridge/types.mjs'"
);

writeFileSync(indexMjsPath, indexContent, 'utf-8');

// Step 9: Create package.json in dist folder to mark as ES module
console.log('\n📝 Creating package.json in dist folder...');
const distPackageJson = {
    type: 'module'
};
writeFileSync(join(__dirname, 'dist', 'package.json'), JSON.stringify(distPackageJson, null, 2), 'utf-8');
console.log('✅ Created dist/package.json');

console.log('\n✅ Build complete!');
console.log('📁 Output: dist/index.mjs');
console.log('📦 Dependencies: dist/node_modules/');
console.log('🔗 Shared modules: dist/shared/');
console.log('🔗 WebSocket shared: dist/websocket-shared/');
