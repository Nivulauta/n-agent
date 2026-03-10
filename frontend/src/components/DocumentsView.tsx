import { Box, Paper, Typography } from '@mui/material';
import DocumentManager from './DocumentManager';

export default function DocumentsView() {
    return (
        <Box sx={{ flexGrow: 1, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Document Management
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Upload and manage your documents. Uploaded documents will be processed and used to enhance AI responses in the chat.
            </Typography>
            <Paper
                elevation={3}
                sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                    p: 2,
                }}
            >
                <DocumentManager />
            </Paper>
        </Box>
    );
}
