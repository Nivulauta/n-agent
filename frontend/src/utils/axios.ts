/**
 * Axios Configuration
 * 
 * Configures axios with interceptors for authentication and error handling.
 */

import axios from 'axios';
import { getAuthHeader, removeToken } from './auth';
import API_CONFIG from '../config/api';

// Create axios instance
const axiosInstance = axios.create({
    baseURL: API_CONFIG.apiUrl,
    timeout: 30000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
axiosInstance.interceptors.request.use(
    (config) => {
        const authHeader = getAuthHeader();
        if (authHeader && Object.keys(authHeader).length > 0) {
            Object.assign(config.headers, authHeader);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle auth errors and provide better error messages
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle authentication errors
        if (error.response?.status === 401) {
            // Token expired or invalid
            removeToken();
            // Reload to trigger login
            window.location.reload();
            return Promise.reject(new Error('Session expired. Please log in again.'));
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || '60';
            return Promise.reject({
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
                retryAfter: parseInt(retryAfter, 10),
                retryable: true
            });
        }

        // Handle server errors
        if (error.response?.status >= 500) {
            return Promise.reject({
                code: 'SERVER_ERROR',
                message: error.response.data?.message || 'Server error occurred. Please try again later.',
                retryable: true
            });
        }

        // Handle network errors
        if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
            return Promise.reject({
                code: 'NETWORK_ERROR',
                message: 'Network error. Please check your connection and try again.',
                retryable: true
            });
        }

        // Handle other client errors
        if (error.response?.status >= 400) {
            return Promise.reject({
                code: error.response.data?.code || 'CLIENT_ERROR',
                message: error.response.data?.message || 'Request failed. Please try again.',
                retryable: false
            });
        }

        // Default error
        return Promise.reject({
            code: 'UNKNOWN_ERROR',
            message: error.message || 'An unexpected error occurred.',
            retryable: true
        });
    }
);

export default axiosInstance;
