import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 60000, // 60 seconds for integration tests
        hookTimeout: 60000,
        teardownTimeout: 60000,
        isolate: true,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
