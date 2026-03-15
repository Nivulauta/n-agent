import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@aws-sdk/lib-dynamodb': path.resolve(__dirname, 'node_modules/@aws-sdk/lib-dynamodb'),
            '@aws-sdk/client-dynamodb': path.resolve(__dirname, 'node_modules/@aws-sdk/client-dynamodb'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
    },
});
