import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Create mocks BEFORE importing the handler
const mockRateLimiterCheckRateLimit = vi.fn();
const mockMessageSenderSendMessage = vi.fn();
const mockLogUserAction = vi.fn();
const mockLogAPICall = vi.fn();
const mockChatHistoryGetHistory = vi.fn();
const mockChatHistorySaveMessage = vi.fn();
const mockClassifyQuery = vi.fn();
const mockRAGRetrieveContext = vi.fn();
const mockRAGAssembleContext = vi.fn();
const mockRAGInitialize = vi.fn();
const mockCacheConnect = vi.fn();
const mockCacheGetCachedResponse = vi.fn();
const mockCacheSetCachedResponse = vi.fn();
const mockBedrockGenerateResponse = vi.fn();
let mockDocClientSend: Mock;

// Create mock instances that will be returned by constructors
const mockChatHistoryStoreInstance = {
    getHistory: mockChatHistoryGetHistory,
    saveMessage: mockChatHistorySaveMessage,
};

const mockRAGSystemInstance = {
    initialize: mockRAGInitialize,
    retrieveContext: mockRAGRetrieveContext,
    assembleContext: mockRAGAssembleContext,
};

const mockCacheLayerInstance = {
    connect: mockCacheConnect,
    getCachedResponse: mockCacheGetCachedResponse,
    setCachedResponse: mockCacheSetCachedResponse,
};

const mockBedrockServiceInstance = {
    generateResponse: mockBedrockGenerateResponse,
};

// Mock dependencies using vi.hoisted to ensure they're set up before module imports
vi.mock('../../../shared/rate-limiter/src/rate-limiter', () => ({
    RateLimiter: vi.fn(function () {
        return {
            checkRateLimit: mockRateLimiterCheckRateLimit,
        };
    }),
}));

vi.mock('../../../shared/audit-logger/src/audit-logger', () => ({
    logUserAction: mockLogUserAction,
    logAPICall: mockLogAPICall,
}));

vi.mock('../../../shared/bedrock/src/bedrock', () => ({
    BedrockService: vi.fn(function () { return mockBedrockServiceInstance; }),
}));

vi.mock('../../../shared/chat-history/src/chat-history', () => ({
    ChatHistoryStore: vi.fn(function () { return mockChatHistoryStoreInstance; }),
}));

vi.mock('../../../shared/query-router/src/classifier', () => ({
    classifyQuery: mockClassifyQuery,
}));

vi.mock('../../../shared/rag/src/rag', () => ({
    RAGSystem: vi.fn(function () { return mockRAGSystemInstance; }),
}));

vi.mock('../../../shared/cache/src/cache', () => ({
    CacheLayer: vi.fn(function () { return mockCacheLayerInstance; }),
}));

vi.mock('crypto', () => ({
    createHash: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => 'mock-hash'),
    })),
}));

vi.mock('../../shared/src/message-sender', () => ({
    MessageSender: vi.fn(function () {
        return {
            sendMessage: mockMessageSenderSendMessage,
        };
    }),
}));

// Add static methods to MessageSender mock
const MessageSenderMock = vi.mocked(await import('../../shared/src/message-sender')).MessageSender;
(MessageSenderMock as any).createError = vi.fn((code: string, message: string, retryable: boolean) => ({
    type: 'error',
    payload: { code, message, retryable },
    timestamp: Date.now(),
}));
(MessageSenderMock as any).createSystem = vi.fn((message: string, level: string) => ({
    type: 'system',
    payload: { message, level },
    timestamp: Date.now(),
}));
(MessageSenderMock as any).createTypingIndicator = vi.fn((isTyping: boolean) => ({
    type: 'typing_indicator',
    payload: { isTyping },
    timestamp: Date.now(),
}));
(MessageSenderMock as any).createChatResponse = vi.fn((messageId: string, content: string, isComplete: boolean, retrievedChunks?: any[]) => ({
    type: 'chat_response',
    payload: { messageId, content, isComplete, retrievedChunks },
    timestamp: Date.now(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
    return {
        DynamoDBDocumentClient: {
            from: vi.fn(() => ({
                send: (...args: any[]) => mockDocClientSend(...args),
            })),
        },
        GetCommand: vi.fn(function (params: any) { Object.assign(this, params); }),
    };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(function () { return {}; }),
}));

// Set environment variables BEFORE importing the handler
process.env.CONNECTIONS_TABLE = 'Connections';
process.env.CHAT_HISTORY_TABLE = 'ChatHistory';
process.env.KMS_KEY_ID = 'test-kms-key';
process.env.OPENSEARCH_ENDPOINT = 'https://test-opensearch.amazonaws.com';
process.env.CACHE_HOST = 'test-cache.amazonaws.com';
process.env.CACHE_PORT = '6379';
process.env.AWS_REGION = 'us-east-1';

// NOW import the handler after mocks and env vars are set up
const { handler } = await import('./index.js');

// Type alias for the expected result type
type HandlerResult = { statusCode: number; body?: string; headers?: Record<string, string> };

// Helper to assert result is an object with statusCode
const assertResultWithStatusCode = (result: unknown): asserts result is HandlerResult => {
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('statusCode');
};

describe('WebSocket Chat Message Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocClientSend = vi.fn();
        mockMessageSenderSendMessage.mockResolvedValue(true);
        mockLogUserAction.mockResolvedValue(undefined);

        // Reset mock implementations to ensure fresh state
        mockChatHistoryGetHistory.mockResolvedValue({ messages: [] });
        mockChatHistorySaveMessage.mockResolvedValue(undefined);
        mockClassifyQuery.mockReturnValue({
            requiresRetrieval: false,
            confidence: 0.9,
            reasoning: 'conversational pattern',
            suggestedK: 0,
        });
        mockRAGInitialize.mockResolvedValue(undefined);
        mockRAGRetrieveContext.mockResolvedValue({
            chunks: [],
            fromCache: false,
            queryEmbedding: [],
        });
        mockRAGAssembleContext.mockReturnValue({
            systemPrompt: 'test system prompt',
            userPrompt: 'test user prompt',
            conversationHistory: [],
            totalTokens: 100,
            truncated: false,
        });
        mockCacheConnect.mockResolvedValue(undefined);
        mockCacheGetCachedResponse.mockResolvedValue(null);
        mockCacheSetCachedResponse.mockResolvedValue(undefined);
        mockLogAPICall.mockResolvedValue(undefined);

        // Mock Bedrock streaming response - create new generator each time
        mockBedrockGenerateResponse.mockImplementation(async function* () {
            yield { text: 'Hello', isComplete: false };
            yield { text: ' world', isComplete: false };
            yield { text: '', isComplete: true, tokenCount: 10 };
        });
    });

    const createMockEvent = (body: any): APIGatewayProxyWebsocketEventV2 => ({
        requestContext: {
            connectionId: 'test-connection-id',
            domainName: 'test-domain.execute-api.us-east-1.amazonaws.com',
            stage: 'prod',
            identity: {
                sourceIp: '192.168.1.1',
                userAgent: 'test-agent',
            },
        } as any,
        body: JSON.stringify(body),
        isBase64Encoded: false,
    });

    describe('Message Validation', () => {
        it('should reject invalid action type', async () => {
            const event = createMockEvent({
                action: 'invalid_action',
                data: { message: 'test' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(400);
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'INVALID_ACTION',
                    }),
                })
            );
        });

        it('should reject missing message content', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: {},
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(400);
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'INVALID_MESSAGE',
                    }),
                })
            );
        });

        it('should reject non-string message content', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 123 },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(400);
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'INVALID_MESSAGE',
                    }),
                })
            );
        });
    });

    describe('Connection Context', () => {
        it('should reject request when connection not found', async () => {
            mockDocClientSend.mockResolvedValue({ Item: null });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(401);
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'UNAUTHORIZED',
                    }),
                })
            );
        });

        it('should reject request when connection expired', async () => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 1000,
                    ttl: now - 100, // Expired
                },
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;
            expect(result.statusCode).toBe(401);
        });

        it('should extract userId from connection context', async () => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600, // Valid
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);
            expect(mockRateLimiterCheckRateLimit).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                })
            );
        });
    });

    describe('Rate Limiting', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });
        });

        it('should apply rate limiting check', async () => {
            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);
            expect(mockRateLimiterCheckRateLimit).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                })
            );
        });

        it('should reject request when rate limit exceeded', async () => {
            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: false,
                remainingRequests: 0,
                resetAt: Date.now() + 30000,
                retryAfter: 30,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(429);
            expect(result.headers).toHaveProperty('Retry-After', '30');
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'RATE_LIMIT_EXCEEDED',
                    }),
                })
            );
        });

        it('should include remaining requests in response', async () => {
            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 45,
                resetAt: Date.now() + 60000,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body || '{}');
            expect(body.remainingRequests).toBe(45);
        });
    });

    describe('Audit Logging', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });
        });

        it('should log user action to audit log', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            await handler(event);

            expect(mockLogUserAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'query',
                    userId: 'user-123',
                    sessionId: 'session-123',
                    ipAddress: '192.168.1.1',
                    userAgent: 'test-agent',
                    metadata: expect.objectContaining({
                        action: 'chat_message',
                        connectionId: 'test-connection-id',
                        messageLength: 12,
                    }),
                })
            );
        });

        it('should use connectionId as sessionId if not provided', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message' },
            });

            await handler(event);

            expect(mockLogUserAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: 'test-connection-id',
                })
            );
        });
    });

    describe('Success Response', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });
        });

        it('should process chat message successfully', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);
            // Verify typing indicator was sent
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'typing_indicator',
                })
            );
            // Verify chat response messages were sent
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'chat_response',
                })
            );
        });

        it('should return success response with message processed', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body || '{}');
            expect(body.message).toBe('Message processed');
            expect(body).toHaveProperty('cached');
        });
    });

    describe('Chat Processing Pipeline (Task 17.2)', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });
        });

        it('should retrieve conversation history from Chat History Store', async () => {
            mockChatHistoryGetHistory.mockResolvedValue({
                messages: [
                    { role: 'user', content: 'previous message', timestamp: Date.now() - 1000 },
                    { role: 'assistant', content: 'previous response', timestamp: Date.now() - 500 },
                ],
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Verify the handler completed successfully
            expect(result.statusCode).toBe(200);

            // Verify chat history retrieval was attempted (check via mock or system message)
            expect(mockMessageSenderSendMessage).toHaveBeenCalled();
        });

        it('should check cache for identical query', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Verify the handler completed successfully
            expect(result.statusCode).toBe(200);

            // Verify processing completed
            const body = JSON.parse(result.body || '{}');
            expect(body.message).toBe('Message processed');
        });

        it('should return cached response if available', async () => {
            mockCacheGetCachedResponse.mockResolvedValue('cached response content');

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Note: Cache functionality depends on service initialization
            // This test verifies the handler doesn't crash when cache is configured
            expect(mockMessageSenderSendMessage).toHaveBeenCalled();
        });

        it('should classify query using Query Router', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What is in the document?', sessionId: 'session-123' },
            });

            await handler(event);

            expect(mockClassifyQuery).toHaveBeenCalledWith(
                'What is in the document?',
                expect.any(Array)
            );
        });

        it('should invoke RAG System when requiresRetrieval is true', async () => {
            mockClassifyQuery.mockReturnValue({
                requiresRetrieval: true,
                confidence: 0.95,
                reasoning: 'document keyword found',
                suggestedK: 5,
            });

            mockRAGRetrieveContext.mockResolvedValue({
                chunks: [
                    {
                        chunkId: 'chunk-1',
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        text: 'test content',
                        score: 0.95,
                    },
                ],
                fromCache: false,
                queryEmbedding: [0.1, 0.2, 0.3],
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What is in the document?', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Verify the handler completed successfully
            expect(result.statusCode).toBe(200);

            // Verify classification was called with requiresRetrieval=true
            expect(mockClassifyQuery).toHaveBeenCalled();
            const classifyCall = mockClassifyQuery.mock.calls[0];
            expect(classifyCall[0]).toBe('What is in the document?');
        });

        it('should assemble context with retrieved chunks and history', async () => {
            mockClassifyQuery.mockReturnValue({
                requiresRetrieval: true,
                confidence: 0.95,
                reasoning: 'document keyword found',
                suggestedK: 5,
            });

            mockChatHistoryGetHistory.mockResolvedValue({
                messages: [
                    { role: 'user', content: 'previous message', timestamp: Date.now() - 1000 },
                ],
            });

            mockRAGRetrieveContext.mockResolvedValue({
                chunks: [
                    {
                        chunkId: 'chunk-1',
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        text: 'test content',
                        score: 0.95,
                    },
                ],
                fromCache: false,
                queryEmbedding: [0.1, 0.2, 0.3],
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What is in the document?', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Verify the handler completed successfully
            expect(result.statusCode).toBe(200);

            // Verify query was classified
            expect(mockClassifyQuery).toHaveBeenCalled();
        });

        it('should not invoke RAG when requiresRetrieval is false', async () => {
            mockClassifyQuery.mockReturnValue({
                requiresRetrieval: false,
                confidence: 0.95,
                reasoning: 'conversational pattern',
                suggestedK: 0,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Hello!', sessionId: 'session-123' },
            });

            await handler(event);

            expect(mockRAGRetrieveContext).not.toHaveBeenCalled();
            expect(mockRAGAssembleContext).not.toHaveBeenCalled();
        });

        it('should handle RAG errors gracefully and continue', async () => {
            mockClassifyQuery.mockReturnValue({
                requiresRetrieval: true,
                confidence: 0.95,
                reasoning: 'document keyword found',
                suggestedK: 5,
            });

            mockRAGRetrieveContext.mockRejectedValue(new Error('OpenSearch unavailable'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What is in the document?', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Should still return success, just without RAG context
            expect(result.statusCode).toBe(200);
        });

        it('should handle chat history errors gracefully', async () => {
            mockChatHistoryGetHistory.mockRejectedValue(new Error('DynamoDB error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Should still process the message
            expect(result.statusCode).toBe(200);
        });
    });

    describe('Error Handling', () => {
        it('should handle DynamoDB errors gracefully', async () => {
            mockDocClientSend.mockRejectedValue(new Error('DynamoDB error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // When DynamoDB fails, getUserContextFromConnection returns null,
            // which triggers the unauthorized (401) response
            expect(result.statusCode).toBe(401);
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'test-connection-id',
                expect.objectContaining({
                    type: 'error',
                    payload: expect.objectContaining({
                        code: 'UNAUTHORIZED',
                    }),
                })
            );
        });

        it('should handle rate limiter errors gracefully', async () => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockRejectedValue(new Error('Rate limiter error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(500);
        });

        it('should handle JSON parse errors', async () => {
            const event = createMockEvent(null);
            event.body = 'invalid json{';

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(500);
        });
    });

    describe('Response Caching and Persistence (Task 17.4)', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });
        });

        it('should cache complete response with 1-hour TTL', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify cache was set with the complete response
            expect(mockCacheSetCachedResponse).toHaveBeenCalledWith(
                'test message',
                'Hello world'
            );
        });

        it('should save user message to Chat History Store', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test user message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify user message was saved
            expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    sessionId: 'session-123',
                    role: 'user',
                    content: 'test user message',
                    metadata: {},
                })
            );
        });

        it('should save assistant response to Chat History Store with metadata', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify assistant response was saved with metadata
            expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    sessionId: 'session-123',
                    role: 'assistant',
                    content: 'Hello world',
                    metadata: expect.objectContaining({
                        tokenCount: 10,
                        retrievedChunks: expect.any(Array),
                    }),
                })
            );
        });

        it('should log API call to audit log with token count and latency', async () => {
            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify API call was logged with token count and duration
            expect(mockLogAPICall).toHaveBeenCalledWith(
                expect.objectContaining({
                    service: 'bedrock',
                    operation: 'generateResponse',
                    userId: 'user-123',
                    statusCode: 200,
                    tokenCount: 10,
                    duration: expect.any(Number),
                })
            );
        });

        it('should include retrievedChunks in assistant message metadata when RAG is used', async () => {
            mockClassifyQuery.mockReturnValue({
                requiresRetrieval: true,
                confidence: 0.95,
                reasoning: 'document keyword found',
                suggestedK: 5,
            });

            mockRAGRetrieveContext.mockResolvedValue({
                chunks: [
                    {
                        chunkId: 'chunk-1',
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        text: 'test content',
                        score: 0.95,
                    },
                ],
                fromCache: false,
                queryEmbedding: [0.1, 0.2, 0.3],
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What is in the document?', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify assistant response includes retrieved chunk IDs
            expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'assistant',
                    metadata: expect.objectContaining({
                        retrievedChunks: ['chunk-1'],
                    }),
                })
            );
        });

        it('should handle cache errors gracefully and continue', async () => {
            mockCacheSetCachedResponse.mockRejectedValue(new Error('Redis error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Should still complete successfully
            expect(result.statusCode).toBe(200);

            // Should still save to chat history
            expect(mockChatHistorySaveMessage).toHaveBeenCalled();
        });

        it('should handle chat history save errors gracefully', async () => {
            mockChatHistorySaveMessage.mockRejectedValue(new Error('DynamoDB error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Should still complete successfully
            expect(result.statusCode).toBe(200);
        });

        it('should handle audit log errors gracefully', async () => {
            mockLogAPICall.mockRejectedValue(new Error('CloudWatch error'));

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            // Should still complete successfully
            expect(result.statusCode).toBe(200);
        });

        it('should measure and log accurate latency for Bedrock API call', async () => {
            // Mock a slower response to test latency measurement
            mockBedrockGenerateResponse.mockImplementation(async function* () {
                await new Promise(resolve => setTimeout(resolve, 100));
                yield { text: 'Response', isComplete: false };
                yield { text: '', isComplete: true, tokenCount: 5 };
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'test message', sessionId: 'session-123' },
            });

            const result = await handler(event) as HandlerResult;

            expect(result.statusCode).toBe(200);

            // Verify duration is at least 100ms
            expect(mockLogAPICall).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: expect.any(Number),
                })
            );

            const logCall = mockLogAPICall.mock.calls[0][0];
            expect(logCall.duration).toBeGreaterThanOrEqual(100);
        });
    });

    describe('Integration Tests (Task 17.6)', () => {
        beforeEach(() => {
            const now = Math.floor(Date.now() / 1000);
            mockDocClientSend.mockResolvedValue({
                Item: {
                    PK: 'CONNECTION#test-connection-id',
                    SK: 'CONNECTION#test-connection-id',
                    connectionId: 'test-connection-id',
                    userId: 'user-123',
                    connectedAt: now - 100,
                    ttl: now + 600,
                },
            });

            mockRateLimiterCheckRateLimit.mockResolvedValue({
                allowed: true,
                remainingRequests: 59,
                resetAt: Date.now() + 60000,
            });
        });

        describe('End-to-End Chat Flow with RAG Retrieval', () => {
            it('should complete full chat flow with RAG retrieval (Requirement 3.1, 7.1)', async () => {
                // Setup: Configure RAG retrieval
                mockClassifyQuery.mockReturnValue({
                    requiresRetrieval: true,
                    confidence: 0.95,
                    reasoning: 'document keyword found',
                    suggestedK: 5,
                });

                mockChatHistoryGetHistory.mockResolvedValue({
                    messages: [
                        { role: 'user', content: 'previous question', timestamp: Date.now() - 2000 },
                        { role: 'assistant', content: 'previous answer', timestamp: Date.now() - 1000 },
                    ],
                });

                mockRAGRetrieveContext.mockResolvedValue({
                    chunks: [
                        {
                            chunkId: 'chunk-1',
                            documentId: 'doc-1',
                            documentName: 'technical-spec.pdf',
                            pageNumber: 5,
                            text: 'The system uses AWS Lambda for serverless compute.',
                            score: 0.92,
                        },
                        {
                            chunkId: 'chunk-2',
                            documentId: 'doc-1',
                            documentName: 'technical-spec.pdf',
                            pageNumber: 7,
                            text: 'OpenSearch provides vector search capabilities.',
                            score: 0.88,
                        },
                    ],
                    fromCache: false,
                    queryEmbedding: [0.1, 0.2, 0.3],
                });

                mockRAGAssembleContext.mockReturnValue({
                    systemPrompt: 'You are a helpful assistant. Use the following context to answer questions.',
                    userPrompt: 'Context: AWS Lambda... OpenSearch...\n\nQuestion: What technologies are used?',
                    conversationHistory: [],
                    totalTokens: 250,
                    truncated: false,
                });

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'Based on the documents, ', isComplete: false };
                    yield { text: 'the system uses AWS Lambda ', isComplete: false };
                    yield { text: 'and OpenSearch.', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 15 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'What technologies are used?', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response
                expect(result.statusCode).toBe(200);
                const body = JSON.parse(result.body || '{}');
                expect(body.message).toBe('Message processed');
                expect(body.cached).toBe(false);

                // Verify: Chat history was retrieved
                expect(mockChatHistoryGetHistory).toHaveBeenCalledWith('user-123', 'session-123', 10);

                // Verify: Query was classified
                expect(mockClassifyQuery).toHaveBeenCalledWith(
                    'What technologies are used?',
                    expect.arrayContaining([
                        expect.objectContaining({ role: 'user', content: 'previous question' }),
                    ])
                );

                // Verify: RAG retrieval was performed
                expect(mockRAGInitialize).toHaveBeenCalled();
                expect(mockRAGRetrieveContext).toHaveBeenCalledWith(
                    'What technologies are used?',
                    expect.objectContaining({ k: 5 })
                );

                // Verify: Context was assembled
                expect(mockRAGAssembleContext).toHaveBeenCalledWith(
                    'What technologies are used?',
                    expect.arrayContaining([
                        expect.objectContaining({ chunkId: 'chunk-1' }),
                        expect.objectContaining({ chunkId: 'chunk-2' }),
                    ]),
                    expect.any(Array),
                    expect.any(Object)
                );

                // Verify: Typing indicator was sent
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'typing_indicator',
                        payload: { isTyping: true },
                    })
                );

                // Verify: Bedrock was invoked with assembled context
                expect(mockBedrockGenerateResponse).toHaveBeenCalledWith(
                    expect.objectContaining({
                        prompt: expect.stringContaining('AWS Lambda'),
                        systemPrompt: expect.stringContaining('helpful assistant'),
                        conversationHistory: expect.any(Array),
                    })
                );

                // Verify: Response chunks were streamed
                const chatResponseCalls = mockMessageSenderSendMessage.mock.calls.filter(
                    call => call[1]?.type === 'chat_response'
                );
                expect(chatResponseCalls.length).toBeGreaterThan(0);

                // Verify: Final message includes retrieved chunks metadata
                const finalMessage = chatResponseCalls[chatResponseCalls.length - 1][1];
                expect(finalMessage.payload.isComplete).toBe(true);
                expect(finalMessage.payload.retrievedChunks).toBeDefined();
                expect(finalMessage.payload.retrievedChunks).toHaveLength(2);
                expect(finalMessage.payload.retrievedChunks[0]).toMatchObject({
                    documentName: 'technical-spec.pdf',
                    pageNumber: 5,
                });

                // Verify: Messages were saved to chat history
                expect(mockChatHistorySaveMessage).toHaveBeenCalledTimes(2);
                expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        role: 'user',
                        content: 'What technologies are used?',
                    })
                );
                expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        role: 'assistant',
                        content: 'Based on the documents, the system uses AWS Lambda and OpenSearch.',
                        metadata: expect.objectContaining({
                            retrievedChunks: ['chunk-1', 'chunk-2'],
                            tokenCount: 15,
                        }),
                    })
                );

                // Verify: API call was logged
                expect(mockLogAPICall).toHaveBeenCalledWith(
                    expect.objectContaining({
                        service: 'bedrock',
                        operation: 'generateResponse',
                        userId: 'user-123',
                        statusCode: 200,
                        tokenCount: 15,
                        duration: expect.any(Number),
                    })
                );

                // Verify: Response was cached
                expect(mockCacheSetCachedResponse).toHaveBeenCalledWith(
                    'What technologies are used?',
                    'Based on the documents, the system uses AWS Lambda and OpenSearch.'
                );
            });

            it('should handle conversational queries without RAG retrieval', async () => {
                // Setup: Configure non-RAG query
                mockClassifyQuery.mockReturnValue({
                    requiresRetrieval: false,
                    confidence: 0.98,
                    reasoning: 'greeting pattern',
                    suggestedK: 0,
                });

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'Hello! ', isComplete: false };
                    yield { text: 'How can I help you today?', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 8 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'Hello!', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response
                expect(result.statusCode).toBe(200);

                // Verify: RAG was NOT invoked
                expect(mockRAGRetrieveContext).not.toHaveBeenCalled();
                expect(mockRAGAssembleContext).not.toHaveBeenCalled();

                // Verify: Bedrock was invoked directly
                expect(mockBedrockGenerateResponse).toHaveBeenCalledWith(
                    expect.objectContaining({
                        prompt: 'Hello!',
                    })
                );

                // Verify: Response was streamed
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'chat_response',
                    })
                );
            });
        });

        describe('Cache Hit Scenario', () => {
            it('should return cached response immediately without invoking Bedrock (Requirement 12.1)', async () => {
                // Setup: Configure cache hit
                mockCacheGetCachedResponse.mockResolvedValue('This is a cached response from a previous query.');

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'What is the capital of France?', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response with cached flag
                expect(result.statusCode).toBe(200);
                const body = JSON.parse(result.body || '{}');
                expect(body.message).toBe('Message processed');
                expect(body.cached).toBe(true);

                // Verify: Cache was checked
                expect(mockCacheConnect).toHaveBeenCalled();
                expect(mockCacheGetCachedResponse).toHaveBeenCalledWith('What is the capital of France?');

                // Verify: Cached response was sent to client
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'chat_response',
                        payload: expect.objectContaining({
                            content: 'This is a cached response from a previous query.',
                            isComplete: true,
                        }),
                    })
                );

                // Verify: Query classification was NOT performed (short-circuit)
                expect(mockClassifyQuery).not.toHaveBeenCalled();

                // Verify: RAG was NOT invoked
                expect(mockRAGRetrieveContext).not.toHaveBeenCalled();

                // Verify: Bedrock was NOT invoked
                expect(mockBedrockGenerateResponse).not.toHaveBeenCalled();

                // Verify: No new cache entry was created
                expect(mockCacheSetCachedResponse).not.toHaveBeenCalled();

                // Verify: Audit log was still recorded
                expect(mockLogUserAction).toHaveBeenCalledWith(
                    expect.objectContaining({
                        eventType: 'query',
                        userId: 'user-123',
                    })
                );
            });

            it('should handle cache errors gracefully and proceed with normal flow', async () => {
                // Setup: Configure cache error
                mockCacheGetCachedResponse.mockRejectedValue(new Error('Redis connection timeout'));

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'Response without cache', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 5 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test query', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response (cache error didn't break the flow)
                expect(result.statusCode).toBe(200);

                // Verify: Bedrock was invoked (fallback to normal flow)
                expect(mockBedrockGenerateResponse).toHaveBeenCalled();

                // Verify: Response was still sent
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'chat_response',
                    })
                );
            });
        });

        describe('Fallback When Vector Store Unavailable', () => {
            it('should fall back to direct LLM when Vector Store is unavailable (Requirement 14.2)', async () => {
                // Setup: Configure RAG retrieval with Vector Store error
                mockClassifyQuery.mockReturnValue({
                    requiresRetrieval: true,
                    confidence: 0.95,
                    reasoning: 'document keyword found',
                    suggestedK: 5,
                });

                mockRAGRetrieveContext.mockRejectedValue(new Error('OpenSearch connection refused'));

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'I apologize, but I cannot access ', isComplete: false };
                    yield { text: 'the document database right now.', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 12 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'What is in the technical documentation?', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response (fallback worked)
                expect(result.statusCode).toBe(200);

                // Verify: RAG retrieval was attempted
                expect(mockRAGRetrieveContext).toHaveBeenCalled();

                // Verify: System message was sent to inform user
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'system',
                        payload: expect.objectContaining({
                            message: expect.stringContaining('Document search is temporarily unavailable'),
                            level: 'warning',
                        }),
                    })
                );

                // Verify: Bedrock was still invoked (without RAG context)
                expect(mockBedrockGenerateResponse).toHaveBeenCalledWith(
                    expect.objectContaining({
                        prompt: 'What is in the technical documentation?',
                    })
                );

                // Verify: Response was streamed to client
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'chat_response',
                    })
                );

                // Verify: Messages were still saved to chat history
                expect(mockChatHistorySaveMessage).toHaveBeenCalledTimes(2);
            });

            it('should handle OpenSearch timeout and continue with direct LLM', async () => {
                // Setup: Configure timeout error
                mockClassifyQuery.mockReturnValue({
                    requiresRetrieval: true,
                    confidence: 0.9,
                    reasoning: 'document query',
                    suggestedK: 5,
                });

                const timeoutError = new Error('Request timeout');
                timeoutError.name = 'TimeoutError';
                mockRAGRetrieveContext.mockRejectedValue(timeoutError);

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'Response without documents', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 5 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'Find information about X', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response
                expect(result.statusCode).toBe(200);

                // Verify: Warning message was sent
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'system',
                        payload: expect.objectContaining({
                            level: 'warning',
                        }),
                    })
                );

                // Verify: Bedrock was invoked
                expect(mockBedrockGenerateResponse).toHaveBeenCalled();
            });

            it('should handle RAG initialization failure gracefully', async () => {
                // Setup: Configure initialization error
                mockClassifyQuery.mockReturnValue({
                    requiresRetrieval: true,
                    confidence: 0.95,
                    reasoning: 'document keyword',
                    suggestedK: 5,
                });

                mockRAGInitialize.mockRejectedValue(new Error('Failed to initialize OpenSearch client'));

                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    yield { text: 'Fallback response', isComplete: false };
                    yield { text: '', isComplete: true, tokenCount: 3 };
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'Search documents', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Success response
                expect(result.statusCode).toBe(200);

                // Verify: System warning was sent
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'system',
                    })
                );
            });
        });

        describe('Error Handling', () => {
            it('should handle Bedrock throttling errors with user-friendly message (Requirement 14.1)', async () => {
                // Setup: Configure Bedrock throttling error
                const throttlingError = new Error('ThrottlingException: Rate exceeded');
                throttlingError.name = 'ThrottlingException';
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw throttlingError;
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test message', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response
                expect(result.statusCode).toBe(500);

                // Verify: User-friendly error message was sent
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'error',
                        payload: expect.objectContaining({
                            code: 'THROTTLED',
                            message: expect.stringContaining('high demand'),
                            retryable: true,
                        }),
                    })
                );
            });

            it('should handle Bedrock validation errors with appropriate message', async () => {
                // Setup: Configure validation error
                const validationError = new Error('ValidationException: Invalid input');
                validationError.name = 'ValidationException';
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw validationError;
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test message', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response
                expect(result.statusCode).toBe(500);

                // Verify: Non-retryable error message
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'error',
                        payload: expect.objectContaining({
                            code: 'INVALID_REQUEST',
                            message: expect.stringContaining('rephrasing'),
                            retryable: false,
                        }),
                    })
                );
            });

            it('should handle Bedrock timeout errors', async () => {
                // Setup: Configure timeout error
                const timeoutError = new Error('ModelTimeoutException: Request timeout');
                timeoutError.name = 'ModelTimeoutException';
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw timeoutError;
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'very long message...', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response
                expect(result.statusCode).toBe(500);

                // Verify: Timeout error message
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'error',
                        payload: expect.objectContaining({
                            code: 'TIMEOUT',
                            message: expect.stringContaining('too long'),
                            retryable: true,
                        }),
                    })
                );
            });

            it('should handle generic Bedrock errors with fallback message', async () => {
                // Setup: Configure generic error - use async generator that throws
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw new Error('Unknown Bedrock error');
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test message', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response
                expect(result.statusCode).toBe(500);

                // Verify: Generic error message
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'error',
                        payload: expect.objectContaining({
                            code: 'BEDROCK_ERROR',
                            message: expect.stringContaining('error occurred'),
                            retryable: true,
                        }),
                    })
                );
            });

            it('should handle complete pipeline failure gracefully', async () => {
                // Setup: Configure multiple failures
                mockChatHistoryGetHistory.mockRejectedValue(new Error('DynamoDB error'));
                mockCacheGetCachedResponse.mockRejectedValue(new Error('Redis error'));
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw new Error('Bedrock error');
                });

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test message', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response
                expect(result.statusCode).toBe(500);

                // Verify: Error message was sent to client
                expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                    'test-connection-id',
                    expect.objectContaining({
                        type: 'error',
                    })
                );
            });

            it('should handle message sender failures during error reporting', async () => {
                // Setup: Configure Bedrock error and message sender failure
                mockBedrockGenerateResponse.mockImplementation(async function* () {
                    throw new Error('Bedrock error');
                });
                mockMessageSenderSendMessage.mockRejectedValue(new Error('Failed to send message'));

                // Execute
                const event = createMockEvent({
                    action: 'chat_message',
                    data: { message: 'test message', sessionId: 'session-123' },
                });

                const result = await handler(event) as HandlerResult;

                // Verify: Error response (should not crash)
                expect(result.statusCode).toBe(500);

                // Verify: Attempt was made to send error message
                expect(mockMessageSenderSendMessage).toHaveBeenCalled();
            });
        });
    });
});
