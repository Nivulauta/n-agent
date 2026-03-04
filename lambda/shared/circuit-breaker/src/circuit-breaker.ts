/**
 * Circuit Breaker Implementation
 * 
 * Implements the circuit breaker pattern to prevent cascading failures
 * when external services are unavailable.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast without calling service
 * - HALF_OPEN: Testing if service has recovered
 * 
 * Requirements: 14.4
 */

export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
    failureThreshold: number; // Number of failures before opening circuit
    successThreshold: number; // Number of successes in HALF_OPEN before closing
    timeout: number; // Time in ms to wait before attempting HALF_OPEN
    name: string; // Circuit breaker name for logging
}

export class CircuitBreakerError extends Error {
    constructor(message: string, public readonly circuitName: string) {
        super(message);
        this.name = 'CircuitBreakerError';
    }
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private nextAttempt: number = 0;
    private readonly options: CircuitBreakerOptions;

    constructor(options: Partial<CircuitBreakerOptions> = {}) {
        this.options = {
            failureThreshold: options.failureThreshold || 5,
            successThreshold: options.successThreshold || 2,
            timeout: options.timeout || 60000, // 60 seconds default
            name: options.name || 'unnamed',
        };
    }

    /**
     * Execute a function with circuit breaker protection
     * 
     * @param fn Function to execute
     * @returns Result of the function
     * @throws CircuitBreakerError if circuit is open
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            const now = Date.now();

            // Check if timeout has elapsed
            if (now < this.nextAttempt) {
                const waitTime = Math.ceil((this.nextAttempt - now) / 1000);
                throw new CircuitBreakerError(
                    `Circuit breaker "${this.options.name}" is OPEN. Service unavailable. Retry in ${waitTime}s.`,
                    this.options.name
                );
            }

            // Transition to HALF_OPEN to test service
            console.log(`Circuit breaker "${this.options.name}" transitioning to HALF_OPEN`);
            this.state = CircuitState.HALF_OPEN;
            this.successCount = 0;
        }

        try {
            // Execute the function
            const result = await fn();

            // Record success
            this.onSuccess();

            return result;
        } catch (error) {
            // Record failure
            this.onFailure();

            throw error;
        }
    }

    /**
     * Record a successful execution
     */
    private onSuccess(): void {
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;

            console.log(
                `Circuit breaker "${this.options.name}" success in HALF_OPEN: ${this.successCount}/${this.options.successThreshold}`
            );

            // Check if we've reached success threshold
            if (this.successCount >= this.options.successThreshold) {
                console.log(`Circuit breaker "${this.options.name}" transitioning to CLOSED`);
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
            }
        }
    }

    /**
     * Record a failed execution
     */
    private onFailure(): void {
        this.failureCount++;

        console.log(
            `Circuit breaker "${this.options.name}" failure: ${this.failureCount}/${this.options.failureThreshold}`
        );

        if (this.state === CircuitState.HALF_OPEN) {
            // Immediately open circuit on failure in HALF_OPEN
            console.log(`Circuit breaker "${this.options.name}" transitioning to OPEN (failed in HALF_OPEN)`);
            this.openCircuit();
        } else if (this.failureCount >= this.options.failureThreshold) {
            // Open circuit when threshold reached
            console.log(`Circuit breaker "${this.options.name}" transitioning to OPEN (threshold reached)`);
            this.openCircuit();
        }
    }

    /**
     * Open the circuit
     */
    private openCircuit(): void {
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.options.timeout;
        this.failureCount = 0;
        this.successCount = 0;

        console.log(
            `Circuit breaker "${this.options.name}" is now OPEN. Will retry at ${new Date(this.nextAttempt).toISOString()}`
        );
    }

    /**
     * Get current circuit state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Get circuit breaker statistics
     */
    getStats(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        nextAttempt: number | null;
    } {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.state === CircuitState.OPEN ? this.nextAttempt : null,
        };
    }

    /**
     * Reset circuit breaker to CLOSED state
     * Useful for testing or manual intervention
     */
    reset(): void {
        console.log(`Circuit breaker "${this.options.name}" manually reset to CLOSED`);
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
    }
}
