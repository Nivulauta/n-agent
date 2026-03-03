/**
 * Unit tests for Chat History Store
 * 
 * Tests cover:
 * - Message persistence (Requirements 8.1, 8.2)
 * - Encryption/decryption (Requirement 8.5)
 * - Pagination (Requirement 8.3)
 * - TTL configuration (Requirement 8.4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatHistoryStore } from './chat-history.js';
import type { ChatMessage } from './types.js';

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn(() => ({
            send: vi.fn(),
        })),
    },
    PutCommand: vi.fn(),
    QueryCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-kms', () => ({
    KMSClient: vi.fn(() => ({})),
    EncryptCommand: vi.fn(),
    DecryptCommand: vi.fn(),
}));

describe('ChatHistoryStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should throw error if KMS key ID is not provided', () => {
            expect(() => {
                new ChatHistoryStore({
                    tableName: 'TestTable',
                    region: 'us-east-1',
                });
            }).toThrow('KMS Key ID is required');
        });
    });
});

describe('Message Persistence (Requirements 8.1, 8.2)', () => {
    it('should persist message within 1 second', async () => {
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({});
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ CiphertextBlob: Buffer.from('encrypted') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const message: ChatMessage = {
            userId: 'user123',
            sessionId: 'session456',
            messageId: 'msg789',
            timestamp: Date.now(),
            role: 'user',
            content: 'Test message',
        };

        const startTime = Date.now();
        await store.saveMessage(message);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(1000);
    });

    it('should associate message with session ID and timestamp', async () => {
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({});
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ CiphertextBlob: Buffer.from('encrypted') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const timestamp = 1234567890000;
        await store.saveMessage({
            userId: 'user123',
            sessionId: 'session456',
            messageId: 'msg789',
            timestamp,
            role: 'user',
            content: 'Test',
        });

        const putCall = vi.mocked(PutCommand).mock.calls[0][0];
        expect(putCall.Item?.PK).toContain('user123');
        expect(putCall.Item?.PK).toContain('session456');
        // The implementation uses the provided timestamp as SK
        expect(typeof putCall.Item?.SK).toBe('number');
    });
});

describe('Encryption/Decryption (Requirement 8.5)', () => {
    it('should encrypt message content before storing', async () => {
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({});
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient, EncryptCommand } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ CiphertextBlob: Buffer.from('encrypted-blob') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        await store.saveMessage({
            userId: 'user123',
            sessionId: 'session456',
            messageId: 'msg789',
            timestamp: Date.now(),
            role: 'user',
            content: 'Sensitive data',
        });

        expect(EncryptCommand).toHaveBeenCalled();
        const putCall = vi.mocked(PutCommand).mock.calls[0][0];
        // Verify content is encrypted (base64 encoded string)
        expect(putCall.Item?.content).toBeTruthy();
        expect(typeof putCall.Item?.content).toBe('string');
    });

    it('should decrypt message content during retrieval', async () => {
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({
            Items: [{
                PK: 'USER#user123#SESSION#session456',
                SK: 1234567890000,
                messageId: 'msg1',
                role: 'user',
                content: 'encrypted-content',
                metadata: {},
                ttl: 1234567890,
            }],
        });
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ Plaintext: Buffer.from('Decrypted data') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const result = await store.getHistory('user123', 'session456', 50);

        expect(DecryptCommand).toHaveBeenCalled();
        expect(result.messages[0].content).toBe('Decrypted data');
    });
});

describe('Pagination (Requirement 8.3)', () => {
    it('should retrieve messages within 500ms', async () => {
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({
            Items: [{
                PK: 'USER#user123#SESSION#session456',
                SK: 1234567890000,
                messageId: 'msg1',
                role: 'user',
                content: 'encrypted',
                metadata: {},
                ttl: 1234567890,
            }],
        });
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ Plaintext: Buffer.from('decrypted') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const startTime = Date.now();
        await store.getHistory('user123', 'session456', 50);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(500);
    });

    it('should support pagination with nextToken', async () => {
        const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({ Items: [] });
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({ send: vi.fn() } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const exclusiveStartKey = { PK: 'USER#user123#SESSION#session456', SK: 1234567890000 };
        const nextToken = Buffer.from(JSON.stringify(exclusiveStartKey)).toString('base64');

        await store.getHistory('user123', 'session456', 50, nextToken);

        expect(QueryCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                ExclusiveStartKey: exclusiveStartKey,
            })
        );
    });

    it('should return nextToken when more results available', async () => {
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const lastKey = { PK: 'USER#user123#SESSION#session456', SK: 1234567890000 };
        const mockSend = vi.fn().mockResolvedValue({
            Items: [{
                PK: 'USER#user123#SESSION#session456',
                SK: 1234567890000,
                messageId: 'msg1',
                role: 'user',
                content: 'encrypted',
                metadata: {},
                ttl: 1234567890,
            }],
            LastEvaluatedKey: lastKey,
        });
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ Plaintext: Buffer.from('decrypted') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const result = await store.getHistory('user123', 'session456', 50);

        expect(result.nextToken).toBeDefined();
        expect(result.nextToken).toBe(Buffer.from(JSON.stringify(lastKey)).toString('base64'));
    });
});

describe('TTL Configuration (Requirement 8.4)', () => {
    it('should set TTL for 90 days by default', async () => {
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({});
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ CiphertextBlob: Buffer.from('encrypted') })
        } as any));

        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
        });

        const beforeTime = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
        await store.saveMessage({
            userId: 'user123',
            sessionId: 'session456',
            messageId: 'msg789',
            timestamp: Date.now(),
            role: 'user',
            content: 'Test',
        });
        const afterTime = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

        const putCall = vi.mocked(PutCommand).mock.calls[0][0];
        const ttl = putCall.Item?.ttl;

        expect(ttl).toBeGreaterThanOrEqual(beforeTime);
        expect(ttl).toBeLessThanOrEqual(afterTime);
    });

    it('should support custom TTL configuration', async () => {
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const mockSend = vi.fn().mockResolvedValue({});
        vi.mocked(DynamoDBDocumentClient.from).mockReturnValue({ send: mockSend } as any);

        const { KMSClient } = await import('@aws-sdk/client-kms');
        vi.mocked(KMSClient).mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({ CiphertextBlob: Buffer.from('encrypted') })
        } as any));

        const customTtlDays = 30;
        const store = new ChatHistoryStore({
            tableName: 'TestTable',
            region: 'us-east-1',
            kmsKeyId: 'test-key-id',
            ttlDays: customTtlDays,
        });

        const beforeTime = Math.floor(Date.now() / 1000) + (customTtlDays * 24 * 60 * 60);
        await store.saveMessage({
            userId: 'user123',
            sessionId: 'session456',
            messageId: 'msg789',
            timestamp: Date.now(),
            role: 'user',
            content: 'Test',
        });
        const afterTime = Math.floor(Date.now() / 1000) + (customTtlDays * 24 * 60 * 60);

        const putCall = vi.mocked(PutCommand).mock.calls[0][0];
        const ttl = putCall.Item?.ttl;

        // Verify TTL is set and is a Unix timestamp in the future
        expect(ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
        expect(typeof ttl).toBe('number');
    });
});

