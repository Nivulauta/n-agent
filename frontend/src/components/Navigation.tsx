import { useState } from 'react';
import {
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Box,
    Typography,
    Divider,
    IconButton,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import {
    Home as HomeIcon,
    Chat as ChatIcon,
    Description as DocumentIcon,
    ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 240;

interface NavigationProps {
    open?: boolean;
    onToggle?: () => void;
}

export default function Navigation({ open: controlledOpen, onToggle }: NavigationProps) {
    const [internalOpen, setInternalOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    console.log('Navigation rendered - location:', location.pathname, 'isMobile:', isMobile);

    // For mobile: use controlled state, for desktop: always open
    const isOpen = isMobile ? (controlledOpen !== undefined ? controlledOpen : internalOpen) : true;
    const handleToggle = onToggle || (() => setInternalOpen(!internalOpen));

    const menuItems = [
        { text: 'Home', icon: <HomeIcon />, path: '/' },
        { text: 'Chat', icon: <ChatIcon />, path: '/chat' },
        { text: 'Documents', icon: <DocumentIcon />, path: '/documents' },
    ];

    const handleNavigation = (path: string) => {
        console.log('=== Navigation Debug ===');
        console.log('Attempting to navigate to:', path);
        console.log('Current location:', location.pathname);
        console.log('Is mobile:', isMobile);
        console.log('=======================');

        navigate(path);

        if (isMobile) {
            handleToggle();
        }
    };

    return (
        <Drawer
            variant={isMobile ? 'temporary' : 'permanent'}
            open={isOpen}
            onClose={handleToggle}
            sx={{
                width: DRAWER_WIDTH,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: DRAWER_WIDTH,
                    boxSizing: 'border-box',
                },
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                }}
            >
                <Typography variant="h6" noWrap component="div">
                    Nivulauta
                </Typography>
                {!isMobile && (
                    <IconButton onClick={handleToggle}>
                        <ChevronLeftIcon />
                    </IconButton>
                )}
            </Box>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.text} disablePadding>
                        <ListItemButton
                            selected={location.pathname === item.path}
                            onClick={() => handleNavigation(item.path)}
                            sx={{
                                '&.Mui-selected': {
                                    backgroundColor: theme.palette.primary.main,
                                    color: theme.palette.primary.contrastText,
                                    '&:hover': {
                                        backgroundColor: theme.palette.primary.dark,
                                    },
                                    '& .MuiListItemIcon-root': {
                                        color: theme.palette.primary.contrastText,
                                    },
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    color: location.pathname === item.path
                                        ? theme.palette.primary.contrastText
                                        : 'inherit',
                                }}
                            >
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}

export { DRAWER_WIDTH };
