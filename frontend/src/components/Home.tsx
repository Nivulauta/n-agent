import { Box, Typography, Paper, Grid, Card, CardContent, CardActionArea } from '@mui/material';
import { Chat as ChatIcon, Description as DocumentIcon, Speed as SpeedIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const features = [
        {
            title: 'Chat with AI',
            description: 'Ask questions and get intelligent responses powered by Claude',
            icon: <ChatIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
            path: '/chat',
        },
        {
            title: 'Manage Documents',
            description: 'Upload and manage your documents for RAG-enhanced responses',
            icon: <DocumentIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
            path: '/documents',
        },
        {
            title: 'Fast & Secure',
            description: 'Real-time responses with enterprise-grade security',
            icon: <SpeedIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
            path: '/chat',
        },
    ];

    return (
        <Box sx={{ flexGrow: 1, p: 3 }}>
            <Paper elevation={0} sx={{ p: 4, mb: 4, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
                <Typography variant="h3" component="h1" gutterBottom>
                    Welcome to the Nivulauta Agent
                </Typography>
                <Typography variant="h6" component="p">
                    Hello, {user?.username}! Get started by exploring the features below.
                </Typography>
            </Paper>

            <Grid container spacing={3}>
                {features.map((feature) => (
                    <Grid size={{ xs: 12, md: 4 }} key={feature.title}>
                        <Card elevation={3}>
                            <CardActionArea onClick={() => navigate(feature.path)} sx={{ height: '100%' }}>
                                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                    <Box sx={{ mb: 2 }}>
                                        {feature.icon}
                                    </Box>
                                    <Typography variant="h5" component="h2" gutterBottom>
                                        {feature.title}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        {feature.description}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Paper elevation={2} sx={{ p: 3, mt: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Quick Start Guide
                </Typography>
                <Typography variant="body1" paragraph>
                    1. <strong>Upload Documents:</strong> Navigate to the Documents section to upload PDF files that will be used to enhance AI responses.
                </Typography>
                <Typography variant="body1" paragraph>
                    2. <strong>Start Chatting:</strong> Go to the Chat section and ask questions. The AI will use your uploaded documents to provide contextual answers.
                </Typography>
                <Typography variant="body1" paragraph>
                    3. <strong>Review Citations:</strong> When the AI references your documents, you'll see citations showing which documents were used.
                </Typography>
            </Paper>
        </Box>
    );
}
