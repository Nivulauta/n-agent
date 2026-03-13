import { expect, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock localStorage for tests
const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString();
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

// Set up localStorage mock before each test
beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true,
    });
    localStorageMock.clear();

    // Mock scrollIntoView for jsdom (not implemented by default)
    Element.prototype.scrollIntoView = () => { };
});

// Cleanup after each test case
afterEach(() => {
    cleanup();
    localStorageMock.clear();
});
