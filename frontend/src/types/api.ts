/**
 * API Type Definitions
 * 
 * TypeScript interfaces for API requests and responses.
 */

// Authentication types
export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    expiresAt: number;
    userId: string;
}

export interface SessionToken {
    token: string;
    expiresAt: number;
    userId: string;
}

// Document types
export interface UploadRequest {
    filename: string;
    fileSize: number;
    contentType: string;
}

export interface UploadResponse {
    uploadUrl: string;
    documentId: string;
    expiresAt: number;
}

export interface Document {
    documentId: string;
    filename: string;
    uploadedAt: number;
    pageCount: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface DocumentListResponse {
    documents: Document[];
    nextToken?: string;
}

// Chat types
export interface ChatMessage {
    messageId: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isStreaming?: boolean; // Indicates if message is currently being streamed
    metadata?: {
        retrievedChunks?: DocumentChunk[];
        tokenCount?: number;
        latency?: number;
        cached?: boolean;
    };
}

export interface DocumentChunk {
    chunkId: string;
    documentId: string;
    documentName: string;
    pageNumber: number;
    text: string;
    score: number;
    metadata?: Record<string, any>;
}

export interface ChatHistoryResponse {
    messages: ChatMessage[];
    nextToken?: string;
}

// WebSocket message types
export interface WebSocketMessage {
    type: 'chat_response' | 'typing_indicator' | 'error' | 'system' | 'rag_context';
    payload: any;
}

export interface ChatResponseMessage extends WebSocketMessage {
    type: 'chat_response';
    payload: {
        messageId?: string;
        content?: string;  // Optional - may be missing when only sending retrievedChunks
        isComplete?: boolean;
        retrievedChunks?: DocumentChunk[];
    };
}

export interface RAGContextMessage extends WebSocketMessage {
    type: 'rag_context';
    payload: {
        messageId?: string;
        retrievedChunks: DocumentChunk[];
    };
}

export interface TypingIndicatorMessage extends WebSocketMessage {
    type: 'typing_indicator';
    payload: {
        isTyping: boolean;
    };
}

export interface ErrorMessage extends WebSocketMessage {
    type: 'error';
    payload: {
        code: string;
        message: string;
        retryable: boolean;
    };
}

// WebSocket client message
export interface ChatMessageRequest {
    action: 'chat_message';
    data: {
        message: string;
        sessionId: string;
    };
}
