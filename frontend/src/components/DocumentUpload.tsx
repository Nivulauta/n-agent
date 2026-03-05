/**
 * DocumentUpload Component
 * 
 * Handles PDF document uploads with validation and progress tracking.
 * Validates file type (PDF only) and size (max 100MB) before upload.
 * Uploads directly to S3 using presigned URLs.
 */

import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { UploadRequest, UploadURL } from '../types';
import API_CONFIG from '../config/api';
import { getToken } from '../utils/auth';
import ErrorMessage from './ErrorMessage';
import './DocumentUpload.css';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_FILE_TYPE = 'application/pdf';

interface DocumentUploadProps {
    onUploadComplete?: (documentId: string) => void;
    onUploadError?: (error: string) => void;
}

export default function DocumentUpload({ onUploadComplete, onUploadError }: DocumentUploadProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): string | null => {
        if (file.type !== ALLOWED_FILE_TYPE) {
            return 'Only PDF files are allowed';
        }
        if (file.size > MAX_FILE_SIZE) {
            return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
        }
        return null;
    };

    const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            setSelectedFile(null);
            return;
        }

        setError(null);
        setSelectedFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setUploadProgress(0);
        setError(null);

        try {
            // Step 1: Get presigned URL from backend
            const sessionToken = getToken();
            if (!sessionToken) {
                throw new Error('Not authenticated');
            }

            const uploadRequest: UploadRequest = {
                filename: selectedFile.name,
                fileSize: selectedFile.size,
                contentType: selectedFile.type,
            };

            const response = await fetch(
                `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.documents.upload}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken.token}`,
                    },
                    credentials: 'include',
                    body: JSON.stringify(uploadRequest),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to get upload URL');
            }

            const uploadData: UploadURL = await response.json();

            // Step 2: Upload directly to S3 using presigned URL
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(progress);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    setUploading(false);
                    setUploadProgress(100);
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                    onUploadComplete?.(uploadData.documentId);
                } else {
                    throw new Error('Upload failed');
                }
            });

            xhr.addEventListener('error', () => {
                throw new Error('Upload failed');
            });

            xhr.open('PUT', uploadData.uploadUrl);
            xhr.setRequestHeader('Content-Type', selectedFile.type);
            xhr.send(selectedFile);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Upload failed';
            setError(errorMessage);
            setUploading(false);
            setUploadProgress(0);
            onUploadError?.(errorMessage);
        }
    };

    const handleCancel = () => {
        setSelectedFile(null);
        setError(null);
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="document-upload">
            <div className="upload-header">
                <h3>Upload Document</h3>
                <p className="upload-hint">PDF files only, max 100MB</p>
            </div>

            <div className="upload-body">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="file-input"
                />

                {selectedFile && (
                    <div className="selected-file">
                        <div className="file-info">
                            <span className="file-name">{selectedFile.name}</span>
                            <span className="file-size">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                        </div>
                        {!uploading && (
                            <div className="file-actions">
                                <button onClick={handleUpload} className="btn-upload">
                                    Upload
                                </button>
                                <button onClick={handleCancel} className="btn-cancel">
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {uploading && (
                    <div className="upload-progress">
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <span className="progress-text">{uploadProgress}%</span>
                    </div>
                )}

                {error && (
                    <ErrorMessage
                        message={error}
                        severity="error"
                        retryable={!error.includes('Only PDF') && !error.includes('File size')}
                        onRetry={handleUpload}
                        onDismiss={() => setError(null)}
                    />
                )}
            </div>
        </div>
    );
}
