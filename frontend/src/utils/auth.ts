/**
 * Authentication Utility Functions
 * 
 * Handles session token storage, retrieval, and validation in localStorage.
 */

import type { SessionToken, UserContext } from '../types/auth';

const TOKEN_KEY = 'chatbot_session_token';
const USER_KEY = 'chatbot_user_context';

/**
 * Store session token in localStorage
 */
export const storeToken = (token: SessionToken): void => {
    try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    } catch (error) {
        console.error('Failed to store token:', error);
    }
};

/**
 * Retrieve session token from localStorage
 */
export const getToken = (): SessionToken | null => {
    try {
        const tokenStr = localStorage.getItem(TOKEN_KEY);
        if (!tokenStr) return null;

        const token: SessionToken = JSON.parse(tokenStr);

        // Check if token is expired
        if (isTokenExpired(token)) {
            removeToken();
            return null;
        }

        return token;
    } catch (error) {
        console.error('Failed to retrieve token:', error);
        return null;
    }
};

/**
 * Remove session token from localStorage
 */
export const removeToken = (): void => {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (error) {
        console.error('Failed to remove token:', error);
    }
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token: SessionToken): boolean => {
    return Date.now() >= token.expiresAt;
};

/**
 * Store user context in localStorage
 */
export const storeUserContext = (user: UserContext): void => {
    try {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
        console.error('Failed to store user context:', error);
    }
};

/**
 * Retrieve user context from localStorage
 */
export const getUserContext = (): UserContext | null => {
    try {
        const userStr = localStorage.getItem(USER_KEY);
        if (!userStr) return null;

        return JSON.parse(userStr);
    } catch (error) {
        console.error('Failed to retrieve user context:', error);
        return null;
    }
};

/**
 * Get authorization header for API requests
 */
export const getAuthHeader = (): { Authorization: string } | Record<string, never> => {
    const token = getToken();
    if (!token) return {};

    return {
        Authorization: `Bearer ${token.token}`,
    };
};
