# Authentication Components

This directory contains the authentication components for the AWS Claude RAG Chatbot frontend.

## Components

### Login Component (`Login.tsx`)

A Material-UI based login form that handles user authentication.

**Features:**
- Username/password input fields
- Form validation
- Loading states during authentication
- Error handling with user-friendly messages
- Responsive design

**Usage:**
```tsx
import { Login } from './components/Login';

<Login />
```

### ProtectedRoute Component (`ProtectedRoute.tsx`)

A wrapper component that requires authentication to access child components.

**Features:**
- Checks authentication state
- Shows loading spinner while checking auth
- Redirects to login if not authenticated
- Renders children if authenticated

**Usage:**
```tsx
import { ProtectedRoute } from './components/ProtectedRoute';

<ProtectedRoute>
  <YourProtectedComponent />
</ProtectedRoute>
```

## Context

### AuthContext (`contexts/AuthContext.tsx`)

Provides authentication state and methods throughout the application.

**Features:**
- Manages authentication state (user, token, loading)
- Handles login/logout operations
- Automatic token expiration checking
- Token refresh functionality
- Persists auth state in localStorage

**Usage:**
```tsx
import { useAuth } from './contexts/AuthContext';

function MyComponent() {
  const { isAuthenticated, user, login, logout } = useAuth();
  
  // Use auth state and methods
}
```

**Available Methods:**
- `login(credentials)` - Authenticate user with username/password
- `logout()` - Log out user and clear session
- `refreshToken()` - Manually refresh token from localStorage

**Available State:**
- `isAuthenticated` - Boolean indicating if user is logged in
- `user` - User context object (userId, username, roles, sessionId)
- `token` - JWT session token
- `loading` - Boolean indicating if auth state is being initialized

## Utilities

### Auth Utils (`utils/auth.ts`)

Helper functions for token management in localStorage.

**Functions:**
- `storeToken(token)` - Store session token
- `getToken()` - Retrieve session token
- `removeToken()` - Remove session token
- `isTokenExpired(token)` - Check if token is expired
- `storeUserContext(user)` - Store user context
- `getUserContext()` - Retrieve user context
- `getAuthHeader()` - Get authorization header for API requests

### Axios Configuration (`utils/axios.ts`)

Configured axios instance with authentication interceptors.

**Features:**
- Automatically adds auth token to requests
- Handles 401 errors (token expiration)
- Automatic logout on authentication failure

**Usage:**
```tsx
import axiosInstance from './utils/axios';

// Token is automatically added to headers
const response = await axiosInstance.get('/api/endpoint');
```

## Types

### Auth Types (`types/auth.ts`)

TypeScript type definitions for authentication.

**Types:**
- `UserCredentials` - Login credentials (username, password)
- `SessionToken` - Session token data (token, expiresAt, userId)
- `UserContext` - User information (userId, username, roles, sessionId)
- `AuthState` - Authentication state (isAuthenticated, user, token, loading)
- `LoginResponse` - API login response format

## Integration

### App Integration

The authentication system is integrated into the main App component:

```tsx
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <YourAppContent />
      </ProtectedRoute>
    </AuthProvider>
  );
}
```

## Token Management

### Token Storage
- Tokens are stored in localStorage with key `chatbot_session_token`
- User context is stored in localStorage with key `chatbot_user_context`

### Token Expiration
- Tokens expire after 24 hours (as per requirements)
- Automatic expiration check runs every minute
- Expired tokens trigger automatic logout

### Token Refresh
- Token state is initialized from localStorage on app load
- Token is validated on every page load
- Expired tokens are automatically removed

## Error Handling

The authentication system handles various error scenarios:

- **Invalid credentials (401)**: "Invalid username or password"
- **Rate limiting (429)**: "Too many login attempts. Please try again later."
- **Server errors (5xx)**: "Server error. Please try again later."
- **Network errors**: "Unable to connect to server. Please check your connection."
- **Token expiration**: Automatic logout and redirect to login

## Security Features

1. **Secure token storage**: Tokens stored in localStorage (HTTPS required in production)
2. **Automatic expiration**: Tokens expire after 24 hours
3. **Automatic logout**: Invalid/expired tokens trigger logout
4. **Authorization headers**: Tokens automatically added to API requests
5. **Error handling**: Graceful handling of authentication failures

## Requirements Satisfied

- **Requirement 1.1**: Session token generation within 500ms
- **Requirement 1.2**: Invalid credentials rejection with error message
- **Requirement 1.4**: Session token expiration and logout functionality
