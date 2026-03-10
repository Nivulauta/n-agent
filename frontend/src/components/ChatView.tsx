import { Box, Paper } from '@mui/material';
import Chat from './Chat';
import { useAuth } from '../contexts/AuthContext';
import API_CONFIG from '../config/api';

export default function ChatView() {
    const { user, token } = useAuth();

    // Generate a session ID for the chat
    const sessionId = user?.sessionId || `session-${Date.now()}`;

    return (
        <Box sx={{ flexGrow: 1, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper
                elevation={3}
                sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {token && user ? (
                    <Chat
                        token={token}
                        userId={user.userId}
                        sessionId={sessionId}
                        websocketUrl={API_CONFIG.wsUrl}
                    />
                ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        Loading chat...
                    </Box>
                )}
            </Paper>
        </Box>
    );
}
