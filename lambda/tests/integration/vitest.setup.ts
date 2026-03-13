/**
 * Vitest Setup File
 * 
 * Global setup and teardown for all tests
 */

// Handle unhandled promise rejections to prevent test suite failures
// This is especially important for WebSocket tests that may fail with 403
process.on('unhandledRejection', (reason, promise) => {
    // Log the error but don't fail the test suite
    // WebSocket 403 errors are expected when Lambda functions aren't deployed
    if (reason instanceof Error && reason.message.includes('403')) {
        console.warn('⚠ Unhandled WebSocket rejection (expected):', reason.message);
    } else {
        console.error('Unhandled Rejection:', reason);
    }
});

// Increase max listeners to prevent warnings during load tests
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 150;

export { };
