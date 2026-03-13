import { useEffect } from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import Chat from './Chat';
import ChatHistory from './ChatHistory';
import { useAuth } from '../contexts/AuthContext';
import { useChatHistory } from '../contexts/ChatHistoryContext';
import API_CONFIG from '../config/api';

export default function ChatView() {
    const { user, token } = useAuth();
    const { isHistoryOpen, toggleHistory, closeHistory } = useChatHistory();

    // Generate a session ID for the chat
    const sessionId = user?.sessionId || `session-${Date.now()}`;

    // Close history when leaving the chat view
    useEffect(() => {
        return () => {
            closeHistory();
        };
    }, [closeHistory]);

    return (
        <Box sx={{ flexGrow: 1, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper
                elevation={3}
                sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'row',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {token && user ? (
                    <>
                        <Box sx={{
                            flexGrow: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative'
                        }}>
                            {/* History Toggle Button */}
                            <Box sx={{
                                position: 'absolute',
                                top: 16,
                                right: 16,
                                zIndex: 10
                            }}>
                                <Tooltip title={isHistoryOpen ? "Hide History" : "Show History"}>
                                    <IconButton
                                        onClick={toggleHistory}
                                        sx={{
                                            backgroundColor: 'background.paper',
                                            boxShadow: 2,
                                            '&:hover': {
                                                backgroundColor: 'action.hover',
                                            },
                                        }}
                                    >
                                        <HistoryIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>

                            <Chat
                                token={token}
                                userId={user.userId}
                                sessionId={sessionId}
                                websocketUrl={API_CONFIG.wsUrl}
                            />
                        </Box>

                        {/* Chat History Panel */}
                        {isHistoryOpen && (
                            <Box sx={{
                                width: 400,
                                borderLeft: 1,
                                borderColor: 'divider',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <ChatHistory
                                    sessionId={sessionId}
                                    onClose={closeHistory}
                                />
                            </Box>
                        )}
                    </>
                ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        Loading chat...
                    </Box>
                )}
            </Paper>
        </Box>
    );
}
