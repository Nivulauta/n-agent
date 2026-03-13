/**
 * DocumentManager Component
 * 
 * Combines DocumentUpload and DocumentList components to provide
 * a complete document management interface.
 */

import { useState } from 'react';
import DocumentUpload from './DocumentUpload';
import DocumentList from './DocumentList';
import './DocumentManager.css';

export default function DocumentManager() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [notification, setNotification] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const handleUploadComplete = () => {
        setNotification({
            type: 'success',
            message: 'Document uploaded successfully! Processing will begin shortly.',
        });
        setRefreshTrigger(prev => prev + 1);

        // Clear notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
    };

    const handleUploadError = (error: string) => {
        setNotification({
            type: 'error',
            message: `Upload failed: ${error}`,
        });

        // Clear notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
    };

    const handleDeleteSuccess = () => {
        setNotification({
            type: 'success',
            message: 'Document deleted successfully',
        });

        // Clear notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
    };

    const handleDeleteError = (error: string) => {
        setNotification({
            type: 'error',
            message: `Delete failed: ${error}`,
        });

        // Clear notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
    };

    return (
        <div className="document-manager">
            {notification && (
                <div className={`notification notification-${notification.type}`}>
                    {notification.message}
                    <button
                        className="notification-close"
                        onClick={() => setNotification(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="manager-content">
                <DocumentUpload
                    onUploadComplete={handleUploadComplete}
                    onUploadError={handleUploadError}
                />

                <DocumentList
                    refreshTrigger={refreshTrigger}
                    onDeleteSuccess={handleDeleteSuccess}
                    onDeleteError={handleDeleteError}
                />
            </div>
        </div>
    );
}
