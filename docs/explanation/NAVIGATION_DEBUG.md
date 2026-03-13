# Navigation Debug Guide

## Issue
Sidebar navigation is not working.

## Potential Causes

### 1. Router Not Wrapping Components
**Check:** Ensure BrowserRouter wraps the entire app
**Fix:** Already implemented in App.tsx

### 2. Navigation Component Not Rendering
**Debug Steps:**
1. Open browser DevTools
2. Check if Navigation component is in the DOM
3. Look for any console errors

### 3. Click Events Not Firing
**Debug Steps:**
1. Add console.log in handleNavigation function
2. Check if onClick is being triggered

### 4. Routes Not Matching
**Debug Steps:**
1. Check current URL in browser
2. Verify route paths match exactly
3. Check for trailing slashes

## Quick Fixes to Try

### Fix 1: Add Debug Logging
Add to Navigation.tsx handleNavigation:
```typescript
const handleNavigation = (path: string) => {
    console.log('Navigating to:', path);
    console.log('Current location:', location.pathname);
    navigate(path);
    if (isMobile) {
        handleToggle();
    }
};
```

### Fix 2: Check if Router is Working
Add to Home.tsx:
```typescript
import { useNavigate } from 'react-router-dom';

// In component:
const navigate = useNavigate();
console.log('Home component rendered');

// Test button:
<Button onClick={() => navigate('/chat')}>Go to Chat</Button>
```

### Fix 3: Verify Routes are Registered
Check browser console for:
```
React Router: No routes matched location "/"
```

### Fix 4: Check Material-UI Theme
Ensure theme is properly initialized:
```typescript
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>
```

## Testing Steps

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Check for TypeScript errors:**
   ```bash
   npx tsc --noEmit
   ```

3. **Run dev server:**
   ```bash
   npm run dev
   ```

4. **Open browser console and check for:**
   - React Router errors
   - Material-UI warnings
   - JavaScript errors
   - Network errors

5. **Test navigation manually:**
   - Type URLs directly: `http://localhost:5173/`, `/chat`, `/documents`
   - Check if routes work via URL
   - If URL navigation works but sidebar doesn't, it's a click handler issue

## Common Issues

### Issue: Drawer appears but clicks don't work
**Cause:** z-index or pointer-events issue
**Fix:** Check CSS for `pointer-events: none` or z-index conflicts

### Issue: Navigation renders but routes don't change
**Cause:** Router not properly configured
**Fix:** Ensure Router wraps Routes component

### Issue: Page refreshes on navigation
**Cause:** Using <a> tags instead of navigate()
**Fix:** Use navigate() from react-router-dom

### Issue: Routes work via URL but not via navigation
**Cause:** Click handler not calling navigate()
**Fix:** Verify handleNavigation is being called

## Current Implementation

### App Structure:
```
<Router>
  <AuthProvider>
    <ChatProvider>
      <ProtectedRoute>
        <MainContent>
          <Navigation />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<ChatView />} />
            <Route path="/documents" element={<DocumentsView />} />
          </Routes>
        </MainContent>
      </ProtectedRoute>
    </ChatProvider>
  </AuthProvider>
</Router>
```

### Navigation Component:
- Uses `useNavigate()` hook
- Uses `useLocation()` for active state
- Calls `navigate(path)` on click

## If Nothing Works

### Nuclear Option: Simplify Navigation
Replace Navigation.tsx with minimal version:
```typescript
import { useNavigate } from 'react-router-dom';
import { Button, Box } from '@mui/material';

export default function Navigation() {
  const navigate = useNavigate();
  
  return (
    <Box sx={{ p: 2 }}>
      <Button onClick={() => navigate('/')}>Home</Button>
      <Button onClick={() => navigate('/chat')}>Chat</Button>
      <Button onClick={() => navigate('/documents')}>Documents</Button>
    </Box>
  );
}
```

If this works, gradually add back features to find the issue.
