# AWS Claude RAG Chatbot - Frontend

React-based single-page application for the AWS Claude RAG Chatbot system. Built with TypeScript, Vite, and Material-UI.

## Features

- **Real-time Chat Interface**: WebSocket-based bidirectional communication with streaming responses
- **Document Management**: Upload, list, and delete PDF documents with progress tracking
- **Authentication**: Secure login with JWT session tokens
- **Responsive UI**: Material-UI components optimized for desktop and mobile
- **AWS Integration**: Direct S3 uploads using presigned URLs

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development and optimized builds
- **Material-UI (MUI)** for UI components
- **AWS SDK v3** for S3 operations
- **Axios** for REST API calls
- **Native WebSocket API** for real-time communication

## Prerequisites

- Node.js 22+ and npm
- AWS account with API Gateway and S3 configured
- Backend services deployed (see main README)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update with your API endpoints:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
VITE_WS_URL=wss://your-websocket-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
VITE_AWS_REGION=us-east-1
```

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Build for Production

Build optimized static assets for S3 deployment:

```bash
npm run build
```

The build output will be in the `dist/` directory.

## Deployment to S3

We provide automated deployment scripts that handle building, uploading, and cache invalidation:

### Quick Deployment (Recommended)

**Windows (PowerShell):**
```powershell
.\deploy-auto.ps1
```

**Linux/Mac (Bash):**
```bash
./deploy-auto.sh
```

The script automatically:
- Builds the React application
- Retrieves S3 bucket and CloudFront distribution from Terraform
- Uploads to S3 with optimized cache headers
- Invalidates CloudFront cache
- Displays the live URL

### Manual Deployment

If you need more control:

**Windows:**
```powershell
.\deploy.ps1 -BucketName <bucket-name> -DistributionId <dist-id>
```

**Linux/Mac:**
```bash
./deploy.sh <bucket-name> <dist-id>
```

### Documentation

- **Quick Start**: See [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md)
- **Full Guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed documentation

## Project Structure

```
frontend/
├── src/
│   ├── components/        # React components
│   ├── config/           # Configuration files
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Main application component
│   └── main.tsx          # Application entry point
├── public/               # Static assets
├── dist/                 # Build output (generated)
└── vite.config.ts        # Vite configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Configuration

### Vite Configuration

The `vite.config.ts` is optimized for S3 deployment with:
- Code splitting for vendor libraries (React, MUI, AWS SDK)
- Sourcemap disabled for production
- API proxy for local development

### TypeScript Configuration

- `tsconfig.json` - Base TypeScript configuration
- `tsconfig.app.json` - Application-specific settings
- `tsconfig.node.json` - Node.js tooling settings

## Development

### Adding New Components

Create components in `src/components/`:

```typescript
// src/components/MyComponent.tsx
import React from 'react';

export const MyComponent: React.FC = () => {
  return <div>My Component</div>;
};
```

### API Integration

Use the centralized API configuration:

```typescript
import API_CONFIG from './config/api';
import axios from 'axios';

const response = await axios.post(
  `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.auth.login}`,
  { username, password }
);
```

### WebSocket Connection

```typescript
const ws = new WebSocket(API_CONFIG.wsUrl);
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle message
};
```

## Troubleshooting

### CORS Issues

Ensure API Gateway has CORS enabled for your domain:
- Allow origin: `https://your-cloudfront-domain.com`
- Allow methods: `GET, POST, DELETE, OPTIONS`
- Allow headers: `Content-Type, Authorization`

### WebSocket Connection Fails

- Verify WebSocket API Gateway URL is correct
- Check that Lambda Authorizer is properly configured
- Ensure session token is valid and not expired

### Build Errors

Clear cache and reinstall dependencies:

```bash
rm -rf node_modules dist
npm install
npm run build
```

## License

See main project LICENSE file.
