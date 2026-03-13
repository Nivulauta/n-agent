/**
 * Error Handler Utility
 * 
 * Provides centralized error handling and user-friendly error messages.
 */

export interface AppError {
    code: string;
    message: string;
    retryable: boolean;
    retryAfter?: number;
}

/**
 * Parse error from various sources into a standardized AppError
 */
export const parseError = (error: unknown): AppError => {
    // Already an AppError
    if (error && typeof error === 'object' && 'code' in error && 'message' in error && 'retryable' in error) {
        return error as AppError;
    }

    // Axios error with response
    if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as {
            response?: {
                status?: number;
                data?: { message?: string; code?: string };
                headers?: Record<string, string>;
            }
        };
        const status = axiosError.response?.status;
        const data = axiosError.response?.data;

        if (status === 401) {
            return {
                code: 'UNAUTHORIZED',
                message: 'Session expired. Please log in again.',
                retryable: false
            };
        }

        if (status === 429) {
            const retryAfter = parseInt(axiosError.response?.headers?.['retry-after'] || '60', 10);
            return {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. Please wait ${retryAfter} seconds.`,
                retryable: true,
                retryAfter
            };
        }

        if (status && status >= 500) {
            return {
                code: 'SERVER_ERROR',
                message: data?.message || 'Server error. Please try again later.',
                retryable: true
            };
        }

        if (status && status >= 400) {
            return {
                code: data?.code || 'CLIENT_ERROR',
                message: data?.message || 'Request failed. Please try again.',
                retryable: false
            };
        }
    }

    // Network error
    if (error && typeof error === 'object' && 'code' in error && (error.code === 'ECONNABORTED' || (('message' in error) && error.message === 'Network Error'))) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Network error. Please check your connection.',
            retryable: true
        };
    }

    // WebSocket error
    if (error && typeof error === 'object' && 'type' in error && error.type === 'error' && 'data' in error) {
        const wsError = error as { data?: { code?: string; message?: string; retryable?: boolean } };
        return {
            code: wsError.data?.code || 'WEBSOCKET_ERROR',
            message: wsError.data?.message || 'WebSocket error occurred.',
            retryable: wsError.data?.retryable ?? true
        };
    }

    // Generic Error object
    if (error instanceof Error) {
        return {
            code: 'UNKNOWN_ERROR',
            message: error.message || 'An unexpected error occurred.',
            retryable: true
        };
    }

    // Unknown error type
    return {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred.',
        retryable: true
    };
};

/**
 * Get user-friendly error message based on error code
 */
export const getErrorMessage = (code: string, defaultMessage?: string): string => {
    const messages: Record<string, string> = {
        UNAUTHORIZED: 'Your session has expired. Please log in again.',
        RATE_LIMIT_EXCEEDED: 'You are sending requests too quickly. Please slow down.',
        SERVER_ERROR: 'The server encountered an error. Please try again later.',
        NETWORK_ERROR: 'Unable to connect to the server. Please check your internet connection.',
        WEBSOCKET_ERROR: 'Connection to chat server failed. Attempting to reconnect...',
        VALIDATION_ERROR: 'Please check your input and try again.',
        NOT_FOUND: 'The requested resource was not found.',
        FORBIDDEN: 'You do not have permission to perform this action.',
        TIMEOUT: 'The request timed out. Please try again.',
    };

    return messages[code] || defaultMessage || 'An error occurred. Please try again.';
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error: unknown): boolean => {
    const appError = parseError(error);
    return appError.retryable;
};

/**
 * Get retry delay for exponential backoff
 */
export const getRetryDelay = (attemptNumber: number, baseDelay: number = 1000): number => {
    return Math.min(baseDelay * Math.pow(2, attemptNumber), 30000); // Max 30 seconds
};
