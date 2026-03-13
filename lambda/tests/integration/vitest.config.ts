import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 180000, // 3 minutes for performance tests
        hookTimeout: 60000,
        teardownTimeout: 30000,
        isolate: false, // Share context between tests for performance metrics
        setupFiles: ['./vitest.setup.ts'], // Global setup file
    },
});
