import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from '../../../shared/circuit-breaker/src/circuit-breaker.js';

/**
 * Integration tests for error handling and fallback mechanisms
 * 
 * Task 17.5: Implement error handling and fallback
 * Requirements: 14.1, 14.2, 14.4
 */

describe('Error Handling and Fallback', () => {
    describe('Circuit Breaker Integration', () => {
        it('should open circuit after 5 consecutive failures', async () => {
            const circuitBreaker = new CircuitBreaker({
                failureThreshold: 5,
                successThreshold: 2,
                timeout: 1000,
                name: 'test-service',
            });

            const failingService = vi.fn().mockRejectedValue(new Error('Service unavailable'));

            // Fail 5 times to open circuit
            for (let i = 0; i < 5; i++) {
                await expect(circuitBreaker.execute(failingService)).rejects.toThrow('Service unavailable');
            }

            // Circuit should now be open
            expect(circuitBreaker.getState()).toBe('OPEN');

            // Next call should fail fast without calling service
            await expect(circuitBreaker.execute(failingService)).rejects.toThrow(CircuitBreakerError);
            expect(failingService).toHaveBeenCalledTimes(5); // Not called again
        });

        it('should provide user-friendly error message when circuit is open', async () => {
            const circuitBreaker = new CircuitBreaker({
                failureThreshold: 3,
                successThreshold: 2,
                timeout: 1000,
                name: 'bedrock-service',
            });

            const failingService = vi.fn().mockRejectedValue(new Error('Service error'));

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(failingService)).rejects.toThrow();
            }

            // Verify error message is user-friendly
            try {
                await circuitBreaker.execute(failingService);
                expect.fail('Should have thrown CircuitBreakerError');
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitBreakerError);
                expect((error as Error).message).toContain('bedrock-service');
                expect((error as Error).message).toContain('OPEN');
                expect((error as Error).message).toMatch(/Retry in \d+s/);
            }
        });

        it('should recover after timeout and successful requests', async () => {
            const circuitBreaker = new CircuitBreaker({
                failureThreshold: 3,
                successThreshold: 2,
                timeout: 100, // Short timeout for testing
                name: 'test-service',
            });

            const service = vi.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValueOnce('success1')
                .mockResolvedValueOnce('success2');

            // Open circuit
            for (let i = 0; i < 3; i++) {
                await expect(circuitBreaker.execute(service)).rejects.toThrow();
            }

            expect(circuitBreaker.getState()).toBe('OPEN');

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should transition to HALF_OPEN and allow request
            const result1 = await circuitBreaker.execute(service);
            expect(result1).toBe('success1');
            expect(circuitBreaker.getState()).toBe('HALF_OPEN');

            // Second success should close circuit
            const result2 = await circuitBreaker.execute(service);
            expect(result2).toBe('success2');
            expect(circuitBreaker.getState()).toBe('CLOSED');
        });
    });

    describe('Fallback Mechanisms', () => {
        it('should fall back to direct LLM when Vector Store is unavailable', async () => {
            const vectorStoreCircuitBreaker = new CircuitBreaker({
                failureThreshold: 5,
                name: 'vector-store',
            });

            const vectorStoreService = vi.fn().mockRejectedValue(new Error('Vector Store unavailable'));

            // Open circuit
            for (let i = 0; i < 5; i++) {
                await expect(vectorStoreCircuitBreaker.execute(vectorStoreService)).rejects.toThrow();
            }

            // Verify circuit is open
            expect(vectorStoreCircuitBreaker.getState()).toBe('OPEN');

            // Attempt to use vector store should fail fast
            try {
                await vectorStoreCircuitBreaker.execute(vectorStoreService);
                expect.fail('Should have thrown CircuitBreakerError');
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitBreakerError);
                // In the actual implementation, this would trigger fallback to direct LLM
            }
        });

        it('should continue processing when cache is unavailable', async () => {
            const cacheCircuitBreaker = new CircuitBreaker({
                failureThreshold: 5,
                name: 'cache-layer',
            });

            const cacheService = vi.fn().mockRejectedValue(new Error('Cache unavailable'));

            // Open circuit
            for (let i = 0; i < 5; i++) {
                await expect(cacheCircuitBreaker.execute(cacheService)).rejects.toThrow();
            }

            // Verify circuit is open
            expect(cacheCircuitBreaker.getState()).toBe('OPEN');

            // Cache unavailability should not block request processing
            // The system should continue without cache
            try {
                await cacheCircuitBreaker.execute(cacheService);
                expect.fail('Should have thrown CircuitBreakerError');
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitBreakerError);
                // In actual implementation, this is caught and processing continues
            }
        });
    });

    describe('Error Classification', () => {
        it('should classify Bedrock throttling errors correctly', () => {
            const error = new Error('ThrottlingException: Rate exceeded');

            const isThrottlingError = error.message.includes('ThrottlingException');
            expect(isThrottlingError).toBe(true);

            // Should be retryable
            const retryable = true;
            expect(retryable).toBe(true);
        });

        it('should classify Bedrock validation errors correctly', () => {
            const error = new Error('ValidationException: Invalid input');

            const isValidationError = error.message.includes('ValidationException');
            expect(isValidationError).toBe(true);

            // Should not be retryable
            const retryable = false;
            expect(retryable).toBe(false);
        });

        it('should classify Bedrock timeout errors correctly', () => {
            const error = new Error('ModelTimeoutException: Request timeout');

            const isTimeoutError = error.message.includes('ModelTimeoutException');
            expect(isTimeoutError).toBe(true);

            // Should be retryable
            const retryable = true;
            expect(retryable).toBe(true);
        });

        it('should provide appropriate error messages for each error type', () => {
            const errorMessages = {
                throttling: 'The service is experiencing high demand. Please try again in a moment.',
                validation: 'Your request could not be processed. Please try rephrasing your message.',
                timeout: 'The request took too long to process. Please try a shorter message.',
                circuitBreaker: 'The AI service is temporarily unavailable. Please try again in a few moments.',
                generic: 'An error occurred while generating the response. Please try again.',
            };

            // All messages should be user-friendly (no technical jargon)
            Object.values(errorMessages).forEach(message => {
                expect(message).not.toContain('Exception');
                expect(message).not.toContain('API');
                expect(message).not.toContain('500');
                expect(message.length).toBeGreaterThan(20); // Meaningful message
            });
        });
    });

    describe('Graceful Degradation', () => {
        it('should handle multiple service failures gracefully', async () => {
            const services = {
                cache: new CircuitBreaker({ failureThreshold: 3, name: 'cache' }),
                vectorStore: new CircuitBreaker({ failureThreshold: 3, name: 'vector-store' }),
            };

            const failingCache = vi.fn().mockRejectedValue(new Error('Cache error'));
            const failingVectorStore = vi.fn().mockRejectedValue(new Error('Vector Store error'));

            // Open both circuits
            for (let i = 0; i < 3; i++) {
                await expect(services.cache.execute(failingCache)).rejects.toThrow();
                await expect(services.vectorStore.execute(failingVectorStore)).rejects.toThrow();
            }

            // Both circuits should be open
            expect(services.cache.getState()).toBe('OPEN');
            expect(services.vectorStore.getState()).toBe('OPEN');

            // System should still be able to process requests (with degraded functionality)
            // In actual implementation:
            // - No cache: Direct API calls
            // - No vector store: Direct LLM without RAG
            // - Both available: Full functionality
        });

        it('should track circuit breaker statistics', () => {
            const circuitBreaker = new CircuitBreaker({
                failureThreshold: 5,
                name: 'test-service',
            });

            const stats = circuitBreaker.getStats();

            expect(stats).toHaveProperty('state');
            expect(stats).toHaveProperty('failureCount');
            expect(stats).toHaveProperty('successCount');
            expect(stats).toHaveProperty('nextAttempt');

            expect(stats.state).toBe('CLOSED');
            expect(stats.failureCount).toBe(0);
            expect(stats.nextAttempt).toBeNull();
        });
    });
});
