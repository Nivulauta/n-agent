/**
 * DocumentList Component
 * 
 * Displays a list of uploaded documents with their status and metadata.
 * Supports document deletion with confirmation.
 */

import { useState, useEffect } from 'react';
import type { Document, DocumentListResponse, DeleteDocumentResponse } from '../types';
import API_CONFIG from '../config/api';
import { getToken } from '../utils/auth';
import ErrorMessage from './ErrorMessage';
import './DocumentList.css';

interface DocumentListProps {
    refreshTrigger?: number;
    onDeleteSuccess?: (documentId: string) => void;
    onDeleteError?: (error: string) => void;
}

export default function DocumentList({
    refreshTrigger,
    onDeleteSuccess,
    onDeleteError
}: DocumentListProps) {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const fetchDocuments = async () => {
        setLoading(true);
        setError(null);

        try {
            const sessionToken = getToken();
            if (!sessionToken) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(
                `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.list}`,
                {
                    headers: {
                        'Authorization': `Bearer ${sessionToken.token}`,
                    },
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch documents');
            }

            const data: DocumentListResponse = await response.json();
            setDocuments(data.documents);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [refreshTrigger]);

    const handleDeleteClick = (documentId: string) => {
        setConfirmDeleteId(documentId);
    };

    const handleCancelDelete = () => {
        setConfirmDeleteId(null);
    };

    const handleConfirmDelete = async (documentId: string) => {
        setDeletingId(documentId);
        setConfirmDeleteId(null);

        try {
            const sessionToken = getToken();
            if (!sessionToken) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(
                `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.delete(documentId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${sessionToken.token}`,
                    },
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to delete document');
            }

            const data: DeleteDocumentResponse = await response.json();

            // Remove document from list
            setDocuments(prev => prev.filter(doc => doc.documentId !== documentId));
            onDeleteSuccess?.(documentId);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
            onDeleteError?.(errorMessage);
        } finally {
            setDeletingId(null);
        }
    };

    const formatDate = (timestamp: number): string => {
        return new Date(timestamp).toLocaleString();
    };

    const getStatusBadgeClass = (status: Document['status']): string => {
        switch (status) {
            case 'completed':
                return 'status-completed';
            case 'processing':
                return 'status-processing';
            case 'pending':
                return 'status-pending';
            case 'failed':
                return 'status-failed';
            default:
                return '';
        }
    };

    if (loading) {
        return (
            <div className="document-list">
                <div className="list-header">
                    <h3>My Documents</h3>
                </div>
                <div className="loading-state">Loading documents...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="document-list">
                <div className="list-header">
                    <h3>My Documents</h3>
                </div>
                <ErrorMessage
                    title="Failed to Load Documents"
                    message={error}
                    severity="error"
                    retryable={true}
                    onRetry={fetchDocuments}
                    onDismiss={() => setError(null)}
                />
            </div>
        );
    }

    return (
        <div className="document-list">
            <div className="list-header">
                <h3>My Documents</h3>
                <button onClick={fetchDocuments} className="btn-refresh" disabled={loading}>
                    Refresh
                </button>
            </div>

            {documents.length === 0 ? (
                <div className="empty-state">
                    <p>No documents uploaded yet</p>
                </div>
            ) : (
                <div className="documents-grid">
                    {documents.map((doc) => (
                        <div key={doc.documentId} className="document-card">
                            <div className="document-header">
                                <span className="document-name" title={doc.filename}>
                                    {doc.filename}
                                </span>
                                <span className={`status-badge ${getStatusBadgeClass(doc.status)}`}>
                                    {doc.status}
                                </span>
                            </div>

                            <div className="document-meta">
                                <div className="meta-item">
                                    <span className="meta-label">Uploaded:</span>
                                    <span className="meta-value">{formatDate(doc.uploadedAt)}</span>
                                </div>
                                {doc.pageCount > 0 && (
                                    <div className="meta-item">
                                        <span className="meta-label">Pages:</span>
                                        <span className="meta-value">{doc.pageCount}</span>
                                    </div>
                                )}
                            </div>

                            <div className="document-actions">
                                {confirmDeleteId === doc.documentId ? (
                                    <div className="confirm-delete">
                                        <span className="confirm-text">Delete this document?</span>
                                        <button
                                            onClick={() => handleConfirmDelete(doc.documentId)}
                                            className="btn-confirm-delete"
                                            disabled={deletingId === doc.documentId}
                                        >
                                            Yes
                                        </button>
                                        <button
                                            onClick={handleCancelDelete}
                                            className="btn-cancel-delete"
                                            disabled={deletingId === doc.documentId}
                                        >
                                            No
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleDeleteClick(doc.documentId)}
                                        className="btn-delete"
                                        disabled={deletingId === doc.documentId}
                                    >
                                        {deletingId === doc.documentId ? 'Deleting...' : 'Delete'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
