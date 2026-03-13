# Navigation Update

## Overview
Added a side navigation bar with separate contexts for Home, Chat, and Documents.

## New Components

### 1. Navigation.tsx
- Side drawer navigation with three main sections:
  - **Home**: Landing page with feature overview
  - **Chat**: Chat interface with AI
  - **Documents**: Document management interface
- Responsive design:
  - Permanent drawer on desktop (md and up)
  - Temporary drawer on mobile (below md)
  - Toggle button for mobile view
- Active route highlighting
- Smooth transitions

### 2. Home.tsx
- Welcome page with user greeting
- Feature cards for quick navigation:
  - Chat with AI
  - Manage Documents
  - Fast & Secure
- Quick start guide
- Click cards to navigate to respective sections

### 3. ChatView.tsx
- Wrapper component for the Chat interface
- Full-page chat experience
- Maintains existing Chat component functionality

### 4. DocumentsView.tsx
- Wrapper component for Document Management
- Full-page document management experience
- Includes title and description
- Maintains existing DocumentManager functionality

## Updated Components

### App.tsx
- Integrated React Router for navigation
- Added side navigation drawer
- Responsive AppBar with menu toggle for mobile
- Route configuration:
  - `/` - Home page
  - `/chat` - Chat interface
  - `/documents` - Document management

## Dependencies Added
- `react-router-dom` - For routing and navigation

## Features

### Responsive Design
- Desktop: Permanent side navigation (240px width)
- Mobile: Collapsible drawer with hamburger menu
- AppBar adjusts width based on drawer state

### User Experience
- Active route highlighting in navigation
- Smooth transitions between views
- Consistent layout across all pages
- User info and logout button in AppBar

### Navigation Flow
1. User logs in
2. Lands on Home page with feature overview
3. Can navigate to Chat or Documents via:
   - Side navigation menu
   - Feature cards on Home page
4. Active section is highlighted in navigation

## Usage

### Running the Application
```bash
cd frontend
npm install
npm run dev
```

### Building for Production
```bash
npm run build
```

## File Structure
```
frontend/src/
├── components/
│   ├── Navigation.tsx       # Side navigation component
│   ├── Navigation.css       # Navigation styles
│   ├── Home.tsx            # Home page component
│   ├── ChatView.tsx        # Chat page wrapper
│   ├── DocumentsView.tsx   # Documents page wrapper
│   └── ...
├── App.tsx                 # Main app with routing
└── ...
```

## Styling
- Uses Material-UI components and theming
- Consistent with existing design system
- Custom CSS for navigation-specific styles
- Responsive breakpoints:
  - Mobile: < 900px (md breakpoint)
  - Desktop: >= 900px

## Future Enhancements
- Add user profile section in navigation
- Add settings page
- Add notifications/alerts section
- Add search functionality
- Add keyboard shortcuts for navigation
