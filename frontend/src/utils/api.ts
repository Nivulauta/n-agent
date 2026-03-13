/**
 * API Utility
 * 
 * Axios-based HTTP client with authentication and error handling.
 */

import axios, { AxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import API_CONFIG from '../config/api';

/**
 * Create authenticated API client
 */
export const createApiClient = (token?: string): AxiosInstance => {
    const client = axios.create({
        baseURL: API_CONFIG.apiUrl,
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    // Request interceptor to add authentication token
    client.interceptors.request.use(
        (config: InternalAxiosRequestConfig) => {
            const authToken = token || getStoredToken();
            if (authToken && config.headers) {
                config.headers.Authorization = `Bearer ${authToken}`;
            }
            return config;
        },
        (error) => {
            return Promise.reject(error);
        }
    );

    // Response interceptor for error handling
    client.interceptors.response.use(
        (response) => response,
        (error: AxiosError) => {
            if (error.response) {
                // Server responded with error status
                const status = error.response.status;
                const data = error.response.data as Record<string, unknown>;

                switch (status) {
                    case 401:
                        // Unauthorized - clear token and redirect to login
                        clearStoredToken();
                        window.location.href = '/login';
                        break;
                    case 429: {
                        // Rate limit exceeded
                        const retryAfter = error.response.headers['retry-after'];
                        throw new Error(
                            `Rate limit exceeded. Please try again in ${retryAfter || 60} seconds.`
                        );
                    } case 500:
                    case 502:
                    case 503:
                    case 504:
                        // Server error
                        throw new Error('Server error. Please try again later.');
                    default:
                        throw new Error(typeof data?.message === 'string' ? data.message : 'An error occurred');
                }
            } else if (error.request) {
                // Request made but no response received
                throw new Error('Network error. Please check your connection.');
            } else {
                // Error setting up request
                throw new Error('Request failed. Please try again.');
            }
        }
    );

    return client;
};

/**
 * Get stored authentication token from localStorage
 */
export const getStoredToken = (): string | null => {
    return localStorage.getItem('authToken');
};

/**
 * Store authentication token in localStorage
 */
export const storeToken = (token: string, expiresAt: number): void => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authTokenExpiry', expiresAt.toString());
};

/**
 * Clear stored authentication token
 */
export const clearStoredToken = (): void => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
    localStorage.removeItem('userId');
};

/**
 * Check if stored token is expired
 */
export const isTokenExpired = (): boolean => {
    const expiry = localStorage.getItem('authTokenExpiry');
    if (!expiry) return true;

    const expiryTime = parseInt(expiry, 10);
    return Date.now() >= expiryTime;
};

/**
 * Get stored user ID
 */
export const getStoredUserId = (): string | null => {
    return localStorage.getItem('userId');
};

/**
 * Store user ID
 */
export const storeUserId = (userId: string): void => {
    localStorage.setItem('userId', userId);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
    const token = getStoredToken();
    return !!token && !isTokenExpired();
};

// Default API client instance
export const apiClient = createApiClient();
