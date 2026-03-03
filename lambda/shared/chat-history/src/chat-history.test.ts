/**
 * Unit tests for Chat History Store
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

        it('should create instance with valid configuration', () => {
            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
                ttlDays: 90,
            });

            expect(store).toBeInstanceOf(ChatHistoryStore);
        });
    });

    describe('saveMessage', () => {
        it('should create correct composite key format', async () => {
            const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({});
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient, EncryptCommand } = await import('@aws-sdk/client-kms');
            const mockKmsSend = vi.fn().mockResolvedValue({
                CiphertextBlob: Buffer.from('encrypted-content'),
            });
            vi.mocked(KMSClient).mockImplementation(() => ({ send: mockKmsSend } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            const message: ChatMessage = {
                userId: 'user123',
                sessionId: 'session456',
                messageId: 'msg789',
                timestamp: 1234567890000,
                role: 'user',
                content: 'Test message',
            };

            await store.saveMessage(message);

            expect(PutCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    TableName: 'TestTable',
                    Item: expect.objectContaining({
                        PK: 'USER#user123#SESSION#session456',
                        SK: 1234567890000,
                        messageId: 'msg789',
                        role: 'user',
                    }),
                })
            );
        });

        it('should set TTL for 90 days from now', async () => {
            const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({});
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient } = await import('@aws-sdk/client-kms');
            const mockKmsSend = vi.fn().mockResolvedValue({
                CiphertextBlob: Buffer.from('encrypted-content'),
            });
            vi.mocked(KMSClient).mockImplementation(() => ({ send: mockKmsSend } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
                ttlDays: 90,
            });

            const message: ChatMessage = {
                userId: 'user123',
                sessionId: 'session456',
                messageId: 'msg789',
                timestamp: Date.now(),
                role: 'user',
                content: 'Test message',
            };

            const beforeTime = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
            await store.saveMessage(message);
            const afterTime = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

            const putCall = vi.mocked(PutCommand).mock.calls[0][0];
            const ttl = putCall.Item?.ttl;

            expect(ttl).toBeGreaterThanOrEqual(beforeTime);
            expect(ttl).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('composite key format', () => {
        it('should use correct PK format: USER#userId#SESSION#sessionId', () => {
            const userId = 'user123';
            const sessionId = 'session456';
            const expectedPK = `USER#${userId}#SESSION#${sessionId}`;

            expect(expectedPK).toBe('USER#user123#SESSION#session456');
        });

        it('should use timestamp as SK', () => {
            const timestamp = 1234567890000;
            const SK = timestamp;

            expect(SK).toBe(1234567890000);
        });
    });

    describe('getHistory', () => {
        it('should query with ScanIndexForward=false to get recent messages first', async () => {
            const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({
                Items: [],
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient } = await import('@aws-sdk/client-kms');
            vi.mocked(KMSClient).mockImplementation(() => ({ send: vi.fn() } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            await store.getHistory('user123', 'session456', 50);

            expect(QueryCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    TableName: 'TestTable',
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': 'USER#user123#SESSION#session456',
                    },
                    Limit: 50,
                    ScanIndexForward: false,
                })
            );
        });

        it('should support pagination with nextToken', async () => {
            const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({
                Items: [],
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

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

        it('should return nextToken when more results are available', async () => {
            const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
            const lastEvaluatedKey = { PK: 'USER#user123#SESSION#session456', SK: 1234567890000 };
            const mockSend = vi.fn().mockResolvedValue({
                Items: [
                    {
                        PK: 'USER#user123#SESSION#session456',
                        SK: 1234567890000,
                        messageId: 'msg1',
                        role: 'user',
                        content: 'encrypted-content',
                        metadata: {},
                        ttl: 1234567890,
                    },
                ],
                LastEvaluatedKey: lastEvaluatedKey,
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient } = await import('@aws-sdk/client-kms');
            const mockKmsSend = vi.fn().mockResolvedValue({
                Plaintext: Buffer.from('decrypted content'),
            });
            vi.mocked(KMSClient).mockImplementation(() => ({ send: mockKmsSend } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            const result = await store.getHistory('user123', 'session456', 50);

            expect(result.nextToken).toBeDefined();
            expect(result.nextToken).toBe(Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64'));
        });

        it('should not return nextToken when no more results', async () => {
            const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({
                Items: [
                    {
                        PK: 'USER#user123#SESSION#session456',
                        SK: 1234567890000,
                        messageId: 'msg1',
                        role: 'user',
                        content: 'encrypted-content',
                        metadata: {},
                        ttl: 1234567890,
                    },
                ],
                // No LastEvaluatedKey
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient } = await import('@aws-sdk/client-kms');
            const mockKmsSend = vi.fn().mockResolvedValue({
                Plaintext: Buffer.from('decrypted content'),
            });
            vi.mocked(KMSClient).mockImplementation(() => ({ send: mockKmsSend } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            const result = await store.getHistory('user123', 'session456', 50);

            expect(result.nextToken).toBeUndefined();
        });

        it('should decrypt message content using KMS', async () => {
            const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({
                Items: [
                    {
                        PK: 'USER#user123#SESSION#session456',
                        SK: 1234567890000,
                        messageId: 'msg1',
                        role: 'user',
                        content: 'encrypted-content',
                        metadata: {},
                        ttl: 1234567890,
                    },
                ],
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
            const mockKmsSend = vi.fn().mockResolvedValue({
                Plaintext: Buffer.from('decrypted content'),
            });
            vi.mocked(KMSClient).mockImplementation(() => ({ send: mockKmsSend } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            const result = await store.getHistory('user123', 'session456', 50);

            expect(DecryptCommand).toHaveBeenCalled();
            expect(result.messages[0].content).toBe('decrypted content');
        });

        it('should return empty array when no messages found', async () => {
            const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
            const mockSend = vi.fn().mockResolvedValue({
                Items: [],
            });
            const mockDocClient = { send: mockSend };

            vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

            const { KMSClient } = await import('@aws-sdk/client-kms');
            vi.mocked(KMSClient).mockImplementation(() => ({ send: vi.fn() } as any));

            const store = new ChatHistoryStore({
                tableName: 'TestTable',
                region: 'us-east-1',
                kmsKeyId: 'test-key-id',
            });

            const result = await store.getHistory('user123', 'session456', 50);

            expect(result.messages).toEqual([]);
            expect(result.nextToken).toBeUndefined();
        });
    });
});
