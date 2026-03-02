/**
 * Types for Chat History Store
 */

export interface ChatMessage {
    userId: string;
    sessionId: string;
    messageId: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    metadata?: {
        retrievedChunks?: string[];
        tokenCount?: number;
        latency?: number;
    };
}

export interface ChatHistoryRecord {
    PK: string; // "USER#<userId>#SESSION#<sessionId>"
    SK: number; // timestamp
    messageId: string;
    role: 'user' | 'assistant';
    content: string; // Encrypted
    metadata: {
        retrievedChunks?: string[];
        tokenCount?: number;
        latency?: number;
        cached?: boolean;
    };
    ttl: number; // Expires after 90 days
}

export interface ChatHistoryConfig {
    tableName?: string;
    region?: string;
    kmsKeyId?: string;
    ttlDays?: number;
}

export interface GetHistoryResult {
    messages: ChatMessage[];
    nextToken?: string;
}
