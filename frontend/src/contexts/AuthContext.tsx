/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import API_CONFIG from '../config/api';
import axiosInstance from '../utils/axios';
import type {
    AuthState,
    UserCredentials,
    LoginResponse,
    SessionToken,
    UserContext,
} from '../types/auth';
import {
    storeToken,
    getToken,
    removeToken,
    storeUserContext,
    getUserContext,
    isTokenExpired,
} from '../utils/auth';

interface AuthContextType extends AuthState {
    login: (credentials: UserCredentials) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [authState, setAuthState] = useState<AuthState>({
        isAuthenticated: false,
        user: null,
        token: null,
        loading: true,
    });

    // Initialize auth state from localStorage on mount
    useEffect(() => {
        const initializeAuth = () => {
            const token = getToken();
            const user = getUserContext();

            if (token && user && !isTokenExpired(token)) {
                setAuthState({
                    isAuthenticated: true,
                    user,
                    token: token.token,
                    loading: false,
                });
            } else {
                removeToken();
                setAuthState({
                    isAuthenticated: false,
                    user: null,
                    token: null,
                    loading: false,
                });
            }
        };

        initializeAuth();
    }, []);

    // Set up token refresh check interval
    useEffect(() => {
        if (!authState.isAuthenticated) return;

        const checkTokenExpiration = () => {
            const token = getToken();
            if (!token || isTokenExpired(token)) {
                logout();
            }
        };

        // Check every minute
        const interval = setInterval(checkTokenExpiration, 60000);

        return () => clearInterval(interval);
    }, [authState.isAuthenticated]);

    const login = async (credentials: UserCredentials): Promise<void> => {
        try {
            const response = await axios.post<LoginResponse>(
                `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.auth.login}`,
                credentials,
                {
                    withCredentials: true,
                }
            );

            const { token, expiresAt, userId, username, roles, sessionId } = response.data;

            // Store token
            const sessionToken: SessionToken = {
                token,
                expiresAt,
                userId,
            };
            storeToken(sessionToken);

            // Store user context
            const userContext: UserContext = {
                userId,
                username: username || credentials.username,
                roles: roles || [],
                sessionId: sessionId || '',
            };
            storeUserContext(userContext);

            // Update state
            setAuthState({
                isAuthenticated: true,
                user: userContext,
                token,
                loading: false,
            });

            // Delay to ensure DynamoDB session is fully propagated and Lambda authorizer is ready
            // This prevents WebSocket 403 errors on first connection attempt
            // The authorizer uses ConsistentRead, but we need to account for:
            // 1. Network latency between login API and session write
            // 2. Lambda cold start for the authorizer
            // 3. API Gateway request routing time
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const logout = async (): Promise<void> => {
        try {
            // Call logout endpoint if authenticated
            if (authState.token) {
                await axiosInstance.post(API_CONFIG.endpoints.auth.logout);
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
            // Continue with local logout even if API call fails
        } finally {
            // Clear local storage and state
            removeToken();
            setAuthState({
                isAuthenticated: false,
                user: null,
                token: null,
                loading: false,
            });
        }
    };

    const refreshToken = (): void => {
        const token = getToken();
        const user = getUserContext();

        if (token && user && !isTokenExpired(token)) {
            setAuthState({
                isAuthenticated: true,
                user,
                token: token.token,
                loading: false,
            });
        } else {
            logout();
        }
    };

    return (
        <AuthContext.Provider
            value={{
                ...authState,
                login,
                logout,
                refreshToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
