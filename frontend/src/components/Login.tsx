/**
 * Login Component
 * 
 * Provides username/password authentication form.
 */

import React, { useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Typography,
    Paper,
    Alert,
    CircularProgress,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!username.trim()) {
            setError('Username is required');
            return;
        }

        if (!password) {
            setError('Password is required');
            return;
        }

        setLoading(true);

        try {
            await login({ username: username.trim(), password });
        } catch (err: any) {
            console.error('Login error:', err);

            // Handle different error types
            if (err.response) {
                // Server responded with error
                const status = err.response.status;
                if (status === 401) {
                    setError('Invalid username or password');
                } else if (status === 429) {
                    setError('Too many login attempts. Please try again later.');
                } else if (status >= 500) {
                    setError('Server error. Please try again later.');
                } else {
                    setError(err.response.data?.message || 'Login failed');
                }
            } else if (err.request) {
                // Request made but no response
                setError('Unable to connect to server. Please check your connection.');
            } else {
                // Other errors
                setError('An unexpected error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                bgcolor: 'background.default',
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    p: 4,
                    maxWidth: 400,
                    width: '100%',
                    mx: 2,
                }}
            >
                <Typography variant="h4" component="h1" gutterBottom align="center">
                    Nivulauta Agent
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom align="center" sx={{ mb: 3 }}>
                    Sign in to continue
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <TextField
                        label="Username"
                        variant="outlined"
                        fullWidth
                        margin="normal"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={loading}
                        autoComplete="username"
                        autoFocus
                    />

                    <TextField
                        label="Password"
                        type="password"
                        variant="outlined"
                        fullWidth
                        margin="normal"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        autoComplete="current-password"
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        size="large"
                        disabled={loading}
                        sx={{ mt: 3 }}
                    >
                        {loading ? (
                            <>
                                <CircularProgress size={24} sx={{ mr: 1 }} />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </form>
            </Paper>
        </Box>
    );
};
