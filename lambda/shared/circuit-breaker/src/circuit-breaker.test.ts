import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitState, CircuitBreakerError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
        circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 1000,
            name: 'test-circuit',
        });
    });

    describe('CLOSED state', () => {
        it('should execute function successfully in CLOSED state', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            const result = await circuitBreaker.execute(fn);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should remain CLOSED after single failure', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('failure'));

            await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');

            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
            expect(circuitBreaker.getStats().failureCount).toBe(1);
        });

        it('should transition to OPEN after reaching failure threshold', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('failure'));

            // Execute 5 times to reach threshold
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
            }

            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
            expect(fn).toHaveBeenCalledTimes(5);
        });

        it('should reset failure count on success', async () => {
            const failFn = vi.fn().mockRejectedValue(new Error('failure'));
            const successFn = vi.fn().mockResolvedValue('success');

            // Fail 3 times
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(failFn)).rejects.toThrow('failure');
            }

            expect(circuitBreaker.getStats().failureCount).toBe(3);

            // Succeed once
            await circuitBreaker.execute(successFn);

            expect(circuitBreaker.getStats().failureCount).toBe(0);
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });
    });

    describe('OPEN state', () => {
        beforeEach(async () => {
            // Open the circuit by failing 5 times
            const fn = vi.fn().mockRejectedValue(new Error('failure'));
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
            }
            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
        });

        it('should reject requests immediately in OPEN state', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            await expect(circuitBreaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
            await expect(circuitBreaker.execute(fn)).rejects.toThrow('Circuit breaker "test-circuit" is OPEN');

            // Function should not be called
            expect(fn).not.toHaveBeenCalled();
        });

        it('should transition to HALF_OPEN after timeout', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 1100));

            await circuitBreaker.execute(fn);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
        });

        it('should include retry time in error message', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            try {
                await circuitBreaker.execute(fn);
                expect.fail('Should have thrown CircuitBreakerError');
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitBreakerError);
                expect((error as Error).message).toMatch(/Retry in \d+s/);
            }
        });
    });

    describe('HALF_OPEN state', () => {
        beforeEach(async () => {
            // Open the circuit
            const fn = vi.fn().mockRejectedValue(new Error('failure'));
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
            }

            // Wait for timeout to transition to HALF_OPEN
            await new Promise(resolve => setTimeout(resolve, 1100));
        });

        it('should transition to CLOSED after success threshold', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            // Execute twice to reach success threshold
            await circuitBreaker.execute(fn);
            expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

            await circuitBreaker.execute(fn);
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should transition back to OPEN on failure', async () => {
            const successFn = vi.fn().mockResolvedValue('success');
            const failFn = vi.fn().mockRejectedValue(new Error('failure'));

            // First success
            await circuitBreaker.execute(successFn);
            expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

            // Then failure
            await expect(circuitBreaker.execute(failFn)).rejects.toThrow('failure');
            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
        });

        it('should allow one request at a time in HALF_OPEN', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            await circuitBreaker.execute(fn);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
        });
    });

    describe('getStats', () => {
        it('should return current statistics', () => {
            const stats = circuitBreaker.getStats();

            expect(stats).toEqual({
                state: CircuitState.CLOSED,
                failureCount: 0,
                successCount: 0,
                nextAttempt: null,
            });
        });

        it('should include nextAttempt when OPEN', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('failure'));

            // Open the circuit
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
            }

            const stats = circuitBreaker.getStats();

            expect(stats.state).toBe(CircuitState.OPEN);
            expect(stats.nextAttempt).toBeGreaterThan(Date.now());
        });
    });

    describe('reset', () => {
        it('should reset circuit to CLOSED state', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('failure'));

            // Open the circuit
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
            }

            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

            // Reset
            circuitBreaker.reset();

            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
            expect(circuitBreaker.getStats().failureCount).toBe(0);
        });
    });

    describe('custom options', () => {
        it('should use custom failure threshold', async () => {
            const customCircuit = new CircuitBreaker({
                failureThreshold: 3,
                name: 'custom-circuit',
            });

            const fn = vi.fn().mockRejectedValue(new Error('failure'));

            // Should open after 3 failures
            for (let i = 0; i < 3; i++) {
                await expect(customCircuit.execute(fn)).rejects.toThrow('failure');
            }

            expect(customCircuit.getState()).toBe(CircuitState.OPEN);
        });

        it('should use custom success threshold', async () => {
            const customCircuit = new CircuitBreaker({
                failureThreshold: 2,
                successThreshold: 3,
                timeout: 100,
                name: 'custom-circuit',
            });

            const failFn = vi.fn().mockRejectedValue(new Error('failure'));
            const successFn = vi.fn().mockResolvedValue('success');

            // Open circuit
            for (let i = 0; i < 2; i++) {
                await expect(customCircuit.execute(failFn)).rejects.toThrow('failure');
            }

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 150));

            // Need 3 successes to close
            await customCircuit.execute(successFn);
            expect(customCircuit.getState()).toBe(CircuitState.HALF_OPEN);

            await customCircuit.execute(successFn);
            expect(customCircuit.getState()).toBe(CircuitState.HALF_OPEN);

            await customCircuit.execute(successFn);
            expect(customCircuit.getState()).toBe(CircuitState.CLOSED);
        });
    });
});
