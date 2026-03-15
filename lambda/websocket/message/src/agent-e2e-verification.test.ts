/**
 * Task 34.1 — Verify agent path end-to-end
 *
 * This integration test verifies the complete agent path works correctly:
 *   1. Agent path is invoked when USE_BEDROCK_AGENT=true and query is classified as agent-eligible
 *   2. The inline agent service is called with proper action groups (built-in + MCP-derived)
 *   3. Streaming response chunks are sent via WebSocket
 *   4. Agent trace events are logged via the audit logger
 *   5. Fallback to RAG pipeline when agent is disabled (USE_BEDROCK_AGENT=false)
 *   6. Fallback to RAG pipeline when agent invocation fails (circuit breaker)
 *
 * Requirements: All agent requirements (16.x, 14.1, 14.2, 14.4)
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// ── Mock function declarations ─────────────────────────────────────────

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

// Agent-specific mocks
const mockInlineAgentInvokeAgentWithToolLoop = vi.fn();
const mockMCPRegistryGetEnabledServers = vi.fn();
const mockMCPBridgeInitialize = vi.fn();
const mockMCPBridgeDiscoverTools = vi.fn();
const mockMCPBridgeToActionGroups = vi.fn();
const mockMCPBridgeDisconnect = vi.fn();
const mockMCPBridgeExecuteTool = vi.fn();

let mockDocClientSend: Mock;

// ── Mock instances ─────────────────────────────────────────────────────

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

const mockInlineAgentServiceInstance = {
    invokeAgentWithToolLoop: mockInlineAgentInvokeAgentWithToolLoop,
};

const mockMCPToolRegistryInstance = {
    getEnabledServers: mockMCPRegistryGetEnabledServers,
};

const mockMCPBridgeInstance = {
    initialize: mockMCPBridgeInitialize,
    discoverTools: mockMCPBridgeDiscoverTools,
    toActionGroups: mockMCPBridgeToActionGroups,
    disconnect: mockMCPBridgeDisconnect,
    executeTool: mockMCPBridgeExecuteTool,
};

// ── Module mocks ───────────────────────────────────────────────────────

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

vi.mock('../../../shared/inline-agent/src/inline-agent', () => ({
    InlineAgentService: vi.fn(function () { return mockInlineAgentServiceInstance; }),
}));

vi.mock('../../../shared/inline-agent/src/instruction-builder', () => ({
    buildAgentInstruction: vi.fn(() => 'You are a document assistant.'),
}));

vi.mock('../../../shared/inline-agent/src/builtin-tools', () => ({
    BUILTIN_ACTION_GROUP: 'DocumentTools',
    createBuiltinToolExecutor: vi.fn(() => vi.fn().mockResolvedValue(null)),
}));

vi.mock('../../../shared/mcp-registry/src/registry', () => ({
    MCPToolRegistry: vi.fn(function () { return mockMCPToolRegistryInstance; }),
}));

vi.mock('../../../shared/mcp-bridge/src/bridge', () => ({
    MCPClientBridge: vi.fn(function () { return mockMCPBridgeInstance; }),
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

// Static methods on MessageSender
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
(MessageSenderMock as any).createChatResponse = vi.fn(
    (messageId: string, content: string, isComplete: boolean, retrievedChunks?: any[]) => ({
        type: 'chat_response',
        payload: { messageId, content, isComplete, retrievedChunks },
        timestamp: Date.now(),
    }),
);

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn(() => ({
            send: (...args: any[]) => mockDocClientSend(...args),
        })),
    },
    GetCommand: vi.fn(function (params: any) { Object.assign(this, params); }),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(function () { return {}; }),
}));

// ── Environment variables ──────────────────────────────────────────────

process.env.CONNECTIONS_TABLE = 'Connections';
process.env.CHAT_HISTORY_TABLE = 'ChatHistory';
process.env.KMS_KEY_ID = 'test-kms-key';
process.env.OPENSEARCH_ENDPOINT = 'https://test-opensearch.amazonaws.com';
process.env.CACHE_HOST = 'test-cache.amazonaws.com';
process.env.CACHE_PORT = '6379';
process.env.AWS_REGION = 'us-east-1';
process.env.MCP_SERVER_CONFIG_TABLE = 'MCPServerConfig';
process.env.AGENT_FOUNDATION_MODEL = 'anthropic.claude-haiku-4-5';
process.env.AGENT_MAX_ITERATIONS = '10';

// Import handler after mocks
const { handler } = await import('./index.js');

type HandlerResult = { statusCode: number; body?: string; headers?: Record<string, string> };

// ── Helpers ────────────────────────────────────────────────────────────

function validConnectionItem() {
    const now = Math.floor(Date.now() / 1000);
    return {
        PK: 'CONNECTION#conn-e2e',
        SK: 'CONNECTION#conn-e2e',
        connectionId: 'conn-e2e',
        userId: 'user-e2e',
        connectedAt: now - 100,
        ttl: now + 600,
    };
}

function createMockEvent(body: any): APIGatewayProxyWebsocketEventV2 {
    return {
        requestContext: {
            connectionId: 'conn-e2e',
            domainName: 'ws.example.com',
            stage: 'prod',
            identity: { sourceIp: '10.0.0.1', userAgent: 'e2e-test' },
        } as any,
        body: JSON.stringify(body),
        isBase64Encoded: false,
    };
}

async function* fakeAgentStream(
    chunks: Array<{ type: string; text?: string; trace?: any; isComplete: boolean }>,
) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

function agentClassification() {
    return {
        requiresRetrieval: false,
        routeType: 'agent' as const,
        confidence: 0.95,
        reasoning: 'multi-step query requiring tools',
        suggestedK: 5,
    };
}

function ragClassification() {
    return {
        requiresRetrieval: true,
        routeType: 'rag' as const,
        confidence: 0.9,
        reasoning: 'document keyword detected',
        suggestedK: 5,
    };
}

function directClassification() {
    return {
        requiresRetrieval: false,
        routeType: 'direct' as const,
        confidence: 0.95,
        reasoning: 'conversational',
        suggestedK: 0,
    };
}

function setupDefaultMocks() {
    mockDocClientSend = vi.fn().mockResolvedValue({ Item: validConnectionItem() });
    mockMessageSenderSendMessage.mockResolvedValue(true);
    mockLogUserAction.mockResolvedValue(undefined);
    mockLogAPICall.mockResolvedValue(undefined);
    mockChatHistoryGetHistory.mockResolvedValue({ messages: [] });
    mockChatHistorySaveMessage.mockResolvedValue(undefined);
    mockCacheConnect.mockResolvedValue(undefined);
    mockCacheGetCachedResponse.mockResolvedValue(null);
    mockCacheSetCachedResponse.mockResolvedValue(undefined);
    mockRateLimiterCheckRateLimit.mockResolvedValue({
        allowed: true,
        remainingRequests: 59,
        resetAt: Date.now() + 60000,
    });
    mockMCPRegistryGetEnabledServers.mockResolvedValue([]);
    mockMCPBridgeInitialize.mockResolvedValue(undefined);
    mockMCPBridgeDiscoverTools.mockResolvedValue([]);
    mockMCPBridgeToActionGroups.mockReturnValue([]);
    mockMCPBridgeDisconnect.mockResolvedValue(undefined);
    mockMCPBridgeExecuteTool.mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });

    // Default Bedrock streaming (used by RAG/direct path)
    mockBedrockGenerateResponse.mockImplementation(async function* () {
        yield { text: 'RAG response', isComplete: false };
        yield { text: '', isComplete: true, tokenCount: 10 };
    });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Task 34.1 — Agent Path End-to-End Verification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupDefaultMocks();
    });

    // ── 1. Agent path invoked when USE_BEDROCK_AGENT=true ──────────────

    describe('Agent path invoked when query is agent-eligible', () => {
        it('should route through agent path with built-in + MCP action groups', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            // Configure an MCP server
            mockMCPRegistryGetEnabledServers.mockResolvedValue([
                { name: 'analytics-server', transport: 'sse', url: 'https://analytics.example.com', enabled: true },
            ]);
            mockMCPBridgeToActionGroups.mockReturnValue([
                {
                    actionGroupName: 'analytics-server',
                    description: 'Analytics tools from MCP',
                    actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
                    functionSchema: {
                        functions: [
                            { name: 'run_query', description: 'Run analytics query', parameters: { sql: { type: 'string', description: 'SQL query', required: true } } },
                        ],
                    },
                },
            ]);

            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    { type: 'text', text: 'I found 42 records matching your criteria.', isComplete: false },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Compare document A with document B and run analytics', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Verify agent was invoked with both built-in and MCP action groups
            expect(mockInlineAgentInvokeAgentWithToolLoop).toHaveBeenCalledWith(
                expect.objectContaining({
                    inputText: 'Compare document A with document B and run analytics',
                    foundationModel: 'anthropic.claude-haiku-4-5',
                    actionGroups: expect.arrayContaining([
                        expect.objectContaining({ actionGroupName: 'DocumentTools' }),
                        expect.objectContaining({ actionGroupName: 'analytics-server' }),
                    ]),
                }),
                expect.any(Function), // toolExecutor
                expect.objectContaining({ maxIterations: 10 }),
            );

            // Verify MCP bridge lifecycle: init → discover → toActionGroups → disconnect
            expect(mockMCPBridgeInitialize).toHaveBeenCalled();
            expect(mockMCPBridgeDiscoverTools).toHaveBeenCalled();
            expect(mockMCPBridgeToActionGroups).toHaveBeenCalled();
            expect(mockMCPBridgeDisconnect).toHaveBeenCalled();

            // Verify standard Bedrock path was NOT used
            expect(mockBedrockGenerateResponse).not.toHaveBeenCalled();
        });
    });

    // ── 2. Streaming response chunks via WebSocket ─────────────────────

    describe('Streaming response arrives via WebSocket', () => {
        it('should stream agent response chunks incrementally to the client', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    { type: 'text', text: 'Step 1: ', isComplete: false },
                    { type: 'text', text: 'Searching documents. ', isComplete: false },
                    { type: 'text', text: 'Step 2: Summarizing.', isComplete: false },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Search and summarize all docs', sessionId: 'sess-1' },
            });

            await handler(event);

            // Collect all chat_response messages
            const chatResponses = mockMessageSenderSendMessage.mock.calls.filter(
                (call: any[]) => call[1]?.type === 'chat_response',
            );

            // Should have incremental chunks + final complete
            expect(chatResponses.length).toBeGreaterThanOrEqual(3);

            // Verify content accumulates correctly
            const contents = chatResponses.map((call: any[]) => call[1].payload.content);
            expect(contents[0]).toBe('Step 1: ');
            expect(contents[1]).toBe('Step 1: Searching documents. ');
            expect(contents[2]).toBe('Step 1: Searching documents. Step 2: Summarizing.');

            // Verify final message is marked complete
            const completeMsgs = chatResponses.filter((call: any[]) => call[1].payload.isComplete === true);
            expect(completeMsgs.length).toBeGreaterThanOrEqual(1);

            // Verify typing indicator was sent before streaming
            const typingCalls = mockMessageSenderSendMessage.mock.calls.filter(
                (call: any[]) => call[1]?.type === 'typing_indicator',
            );
            expect(typingCalls.length).toBeGreaterThanOrEqual(1);
            expect(typingCalls[0][1].payload.isTyping).toBe(true);
        });
    });

    // ── 3. Agent trace events are logged ───────────────────────────────

    describe('Agent trace events are logged', () => {
        it('should log trace events from agent stream to console', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    {
                        type: 'trace',
                        trace: { step: 'orchestration_rationale', reasoning: 'I need to search documents first' },
                        isComplete: false,
                    },
                    {
                        type: 'trace',
                        trace: { step: 'orchestration_invocation', toolUse: { name: 'SearchDocuments', input: { query: 'budget report' } } },
                        isComplete: false,
                    },
                    { type: 'text', text: 'The budget report shows $1M.', isComplete: false },
                    {
                        type: 'trace',
                        trace: { step: 'orchestration_observation', observation: 'Found budget data in doc-123' },
                        isComplete: false,
                    },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What does the budget report say?', sessionId: 'sess-1' },
            });

            await handler(event);

            // Verify trace events were logged with [AgentTrace] prefix
            const traceLogs = consoleSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('[AgentTrace]'),
            );
            expect(traceLogs.length).toBe(3);

            // Verify trace content includes reasoning, tool use, and observation
            const traceContents = traceLogs.map((call) => call[1]);
            expect(traceContents[0]).toContain('orchestration_rationale');
            expect(traceContents[1]).toContain('orchestration_invocation');
            expect(traceContents[2]).toContain('orchestration_observation');

            consoleSpy.mockRestore();
        });

        it('should log user action via audit logger for agent queries', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    { type: 'text', text: 'Done.', isComplete: false },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Use tools to analyze data', sessionId: 'sess-1' },
            });

            await handler(event);

            // Verify audit logger was called for the user action
            expect(mockLogUserAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'query',
                    userId: 'user-e2e',
                    metadata: expect.objectContaining({
                        action: 'chat_message',
                        connectionId: 'conn-e2e',
                    }),
                }),
            );
        });
    });

    // ── 4. Fallback to RAG when agent is disabled ──────────────────────

    describe('Fallback to RAG pipeline when agent is disabled', () => {
        it('should use RAG/direct path when classifier returns non-agent route (feature flag off)', async () => {
            // When USE_BEDROCK_AGENT is false, the classifier will never return routeType='agent'.
            // We simulate this by having the classifier return 'rag'.
            mockClassifyQuery.mockReturnValue(ragClassification());

            mockRAGRetrieveContext.mockResolvedValue({
                chunks: [
                    {
                        chunkId: 'c1',
                        documentId: 'd1',
                        documentName: 'report.pdf',
                        pageNumber: 3,
                        text: 'Revenue increased by 20%',
                        score: 0.92,
                        metadata: {},
                    },
                ],
                fromCache: false,
                queryEmbedding: [],
            });
            mockRAGAssembleContext.mockReturnValue({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Based on the context: Revenue increased by 20%\n\nQuestion: What happened to revenue?',
                conversationHistory: [],
                totalTokens: 150,
                truncated: false,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'What happened to revenue?', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Agent should NOT have been invoked
            expect(mockInlineAgentInvokeAgentWithToolLoop).not.toHaveBeenCalled();

            // RAG system should have been used
            expect(mockRAGRetrieveContext).toHaveBeenCalled();
            expect(mockRAGAssembleContext).toHaveBeenCalled();

            // Standard Bedrock streaming should have been used
            expect(mockBedrockGenerateResponse).toHaveBeenCalled();
        });

        it('should use direct LLM path when classifier returns direct route', async () => {
            mockClassifyQuery.mockReturnValue(directClassification());

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Hello, how are you?', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Agent should NOT have been invoked
            expect(mockInlineAgentInvokeAgentWithToolLoop).not.toHaveBeenCalled();

            // RAG retrieval should NOT have been invoked (direct path)
            expect(mockRAGRetrieveContext).not.toHaveBeenCalled();

            // Standard Bedrock streaming should have been used
            expect(mockBedrockGenerateResponse).toHaveBeenCalled();
        });
    });

    // ── 5. Fallback to RAG when agent invocation fails ─────────────────

    describe('Fallback to RAG pipeline when agent invocation fails (circuit breaker)', () => {
        it('should fall back to RAG when agent throws an error', async () => {
            mockClassifyQuery.mockReturnValue({
                ...agentClassification(),
                requiresRetrieval: true,
            });

            // Agent fails
            mockInlineAgentInvokeAgentWithToolLoop.mockImplementation(() => {
                throw new Error('InvokeInlineAgent API error');
            });

            // RAG path succeeds
            mockRAGRetrieveContext.mockResolvedValue({
                chunks: [
                    { chunkId: 'c1', documentId: 'd1', documentName: 'doc.pdf', pageNumber: 1, text: 'fallback content', score: 0.85, metadata: {} },
                ],
                fromCache: false,
                queryEmbedding: [],
            });
            mockRAGAssembleContext.mockReturnValue({
                systemPrompt: 'system',
                userPrompt: 'user prompt with context',
                conversationHistory: [],
                totalTokens: 100,
                truncated: false,
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Compare all documents', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Verify system warning was sent about agent fallback
            expect(mockMessageSenderSendMessage).toHaveBeenCalledWith(
                'conn-e2e',
                expect.objectContaining({
                    type: 'system',
                    payload: expect.objectContaining({ level: 'warning' }),
                }),
            );

            // Verify standard Bedrock path was used as fallback
            expect(mockBedrockGenerateResponse).toHaveBeenCalled();
        });

        it('should fall back when agent stream errors mid-response', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            // Agent stream throws during iteration
            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                (async function* () {
                    yield { type: 'text', text: 'Starting...', isComplete: false };
                    throw new Error('Connection lost to Bedrock Agent Runtime');
                })(),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Analyze and compare', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Should have fallen back to standard Bedrock path
            expect(mockBedrockGenerateResponse).toHaveBeenCalled();
        });

        it('should still work when MCP registry is unavailable', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            // MCP registry throws (DynamoDB error)
            mockMCPRegistryGetEnabledServers.mockRejectedValue(new Error('DynamoDB timeout'));

            // Agent should still work with built-in tools only
            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    { type: 'text', text: 'Using built-in tools only.', isComplete: false },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Search my documents', sessionId: 'sess-1' },
            });

            const result = (await handler(event)) as HandlerResult;
            expect(result.statusCode).toBe(200);

            // Agent was still invoked with built-in tools
            expect(mockInlineAgentInvokeAgentWithToolLoop).toHaveBeenCalledWith(
                expect.objectContaining({
                    actionGroups: expect.arrayContaining([
                        expect.objectContaining({ actionGroupName: 'DocumentTools' }),
                    ]),
                }),
                expect.any(Function),
                expect.any(Object),
            );

            // MCP bridge should NOT have been initialized (registry failed)
            expect(mockMCPBridgeInitialize).not.toHaveBeenCalled();
        });
    });

    // ── 6. Chat history persistence for agent responses ────────────────

    describe('Agent response persistence', () => {
        it('should save both user message and agent response to chat history', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            mockInlineAgentInvokeAgentWithToolLoop.mockReturnValue(
                fakeAgentStream([
                    { type: 'text', text: 'Here is your analysis.', isComplete: false },
                    { type: 'complete', isComplete: true },
                ]),
            );

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Analyze the quarterly report', sessionId: 'sess-1' },
            });

            await handler(event);

            // Verify user message was saved
            expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-e2e',
                    sessionId: 'sess-1',
                    role: 'user',
                    content: 'Analyze the quarterly report',
                }),
            );

            // Verify assistant response was saved with agentRoute metadata
            expect(mockChatHistorySaveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-e2e',
                    sessionId: 'sess-1',
                    role: 'assistant',
                    content: 'Here is your analysis.',
                    metadata: { agentRoute: true },
                }),
            );
        });
    });

    // ── 7. MCP bridge cleanup on all paths ─────────────────────────────

    describe('MCP bridge cleanup', () => {
        it('should disconnect MCP bridge even when agent fails', async () => {
            mockClassifyQuery.mockReturnValue(agentClassification());

            mockMCPRegistryGetEnabledServers.mockResolvedValue([
                { name: 'test-mcp', transport: 'sse', url: 'https://mcp.test.com', enabled: true },
            ]);
            mockMCPBridgeToActionGroups.mockReturnValue([]);

            // Agent throws
            mockInlineAgentInvokeAgentWithToolLoop.mockImplementation(() => {
                throw new Error('Agent crashed');
            });

            const event = createMockEvent({
                action: 'chat_message',
                data: { message: 'Use tools', sessionId: 'sess-1' },
            });

            await handler(event);

            // MCP bridge should still be disconnected via finally block
            expect(mockMCPBridgeDisconnect).toHaveBeenCalled();
        });
    });
});
