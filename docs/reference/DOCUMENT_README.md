# Document Management Components

This directory contains the document management components for the AWS Claude RAG Chatbot frontend.

## Components

### DocumentUpload

Handles PDF document uploads with validation and progress tracking.

**Features:**
- File type validation (PDF only)
- File size validation (max 100MB)
- Direct S3 upload using presigned URLs
- Real-time upload progress bar
- Error handling and user feedback

**Props:**
```typescript
interface DocumentUploadProps {
    onUploadComplete?: (documentId: string) => void;
    onUploadError?: (error: string) => void;
}
```

**Usage:**
```tsx
import { DocumentUpload } from './components';

<DocumentUpload
    onUploadComplete={(documentId) => console.log('Uploaded:', documentId)}
    onUploadError={(error) => console.error('Error:', error)}
/>
```

### DocumentList

Displays a list of uploaded documents with their status and metadata.

**Features:**
- Fetches and displays user's documents
- Shows document status (pending, processing, completed, failed)
- Document metadata (filename, upload date, page count)
- Delete functionality with confirmation
- Auto-refresh capability
- Loading and error states

**Props:**
```typescript
interface DocumentListProps {
    refreshTrigger?: number;
    onDeleteSuccess?: (documentId: string) => void;
    onDeleteError?: (error: string) => void;
}
```

**Usage:**
```tsx
import { DocumentList } from './components';

<DocumentList
    refreshTrigger={refreshCounter}
    onDeleteSuccess={(documentId) => console.log('Deleted:', documentId)}
    onDeleteError={(error) => console.error('Error:', error)}
/>
```

### DocumentManager

Combines DocumentUpload and DocumentList into a complete document management interface.

**Features:**
- Integrated upload and list functionality
- Notification system for success/error messages
- Automatic list refresh after upload
- Coordinated state management

**Usage:**
```tsx
import { DocumentManager } from './components';

<DocumentManager />
```

## API Integration

The components integrate with the following backend endpoints:

- `POST /documents/upload` - Get presigned URL for document upload
- `GET /documents` - List user's documents
- `DELETE /documents/{documentId}` - Delete a document

All requests require authentication via Bearer token stored in localStorage.

## Validation Rules

### File Upload Validation

1. **File Type**: Only `application/pdf` files are accepted
2. **File Size**: Maximum 100MB (104,857,600 bytes)
3. **Authentication**: Valid session token required

### Upload Flow

1. User selects PDF file
2. Client validates file type and size
3. Client requests presigned URL from backend
4. Client uploads file directly to S3 using presigned URL
5. Backend processes document automatically via S3 event trigger
6. Document appears in list with "processing" status
7. Status updates to "completed" when processing finishes

## Styling

Each component has its own CSS file:
- `DocumentUpload.css` - Upload component styles
- `DocumentList.css` - List component styles
- `DocumentManager.css` - Manager component styles

The styles follow a consistent design system with:
- 8px base spacing unit
- Border radius: 4-8px
- Primary color: #007bff
- Error color: #dc3545
- Success color: #28a745

## Error Handling

All components implement comprehensive error handling:

1. **Network Errors**: Display user-friendly error messages
2. **Validation Errors**: Show specific validation failure reasons
3. **Authentication Errors**: Redirect to login if token invalid
4. **Server Errors**: Display error message with retry option

## Requirements Satisfied

This implementation satisfies the following requirements:

- **Requirement 4.1**: Document upload and management functionality
- **Requirement 4.2**: File validation (PDF only, max 100MB)

## Future Enhancements

Potential improvements for future iterations:

1. Drag-and-drop file upload
2. Bulk document upload
3. Document preview functionality
4. Advanced filtering and sorting
5. Document search
6. Download original document
7. Document sharing capabilities
