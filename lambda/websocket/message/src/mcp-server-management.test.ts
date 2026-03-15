/**
 * MCP Server Management Integration Tests (Task 34.2)
 *
 * Verifies the full MCP server lifecycle:
 * 1. Add a new MCP server config via REST API
 * 2. Agent picks up the new tools on next invocation
 * 3. Disable the server → tools are no longer available
 * 4. Delete the server config → cleanup verified
 *
 * Validates: Requirement 16.1
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// ── Mocks (must be declared before importing handlers) ─────────────────

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
const mockMCPRegistryListServers = vi.fn();
const mockMCPRegistryGetServer = vi.fn();
const mockMCPRegistryUpsertServer = vi.fn();
const mockMCPRegistryDeleteServer = vi.fn();
const mockMCPRegistryInvalidateCache = vi.fn();
const mockMCPBridgeInitialize = vi.fn();
const mockMCPBridgeDiscoverTools = vi.fn();
const mockMCPBridgeToActionGroups = vi.fn();
const mockMCPBridgeDisconnect = vi.fn();

let mockDocClientSend: Mock;

// ── Mock instances ─────────────────────────────────────────────────────

const mockMCPToolRegistryInstance = {
    getEnabledServers: mockMCPRegistryGetEnabledServers,
    listServers: mockMCPRegistryListServers,
    getServer: mockMCPRegistryGetServer,
    upsertServer: mockMCPRegistryUpsertServer,
    deleteServer: mockMCPRegistryDeleteServer,
    invalidateCache: mockMCPRegistryInvalidateCache,
};

const mockMCPBridgeInstance = {
    initialize: mockMCPBridgeInitialize,
    discoverTools: mockMCPBridgeDiscoverTools,
    toActionGroups: mockMCPBridgeToActionGroups,
    disconnect: mockMCPBridgeDisconnect,
};

const mockInlineAgentServiceInstance = {
    invokeAgentWithToolLoop: mockInlineAgentInvokeAgentWithToolLoop,
};

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

// ── Module mocks ───────────────────────────────────────────────────────

vi.mock('../../../shared/rate-limiter/src/rate-limiter', () => ({
    RateLimiter: vi.fn(function () {
        return { checkRateLimit: mockRateLimiterCheckRateLimit };
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
    buildAgentInstruction: vi.fn(() => 'mock agent instruction'),
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
        return { sendMessage: mockMessageSenderSendMessage };
    }),
}));

const MessageSenderMock = vi.mocked(await import('../../shared/src/message-sender')).MessageSender;
(MessageSenderMock as any).createError = vi.fn((code: string, message: string, retryable: boolean) => ({
    type: 'error', payload: { code, message, retryable }, timestamp: Date.now(),
}));
(MessageSenderMock as any).createSystem = vi.fn((message: string, level: string) => ({
    type: 'system', payload: { message, level }, timestamp: Date.now(),
}));
(MessageSenderMock as any).createTypingIndicator = vi.fn((isTyping: boolean) => ({
    type: 'typing_indicator', payload: { isTyping }, timestamp: Date.now(),
}));
(MessageSenderMock as any).createChatResponse = vi.fn(
    (messageId: string, content: string, isComplete: boolean, retrievedChunks?: any[]) => ({
        type: 'chat_response', payload: { messageId, content, isComplete, retrievedChunks }, timestamp: Date.now(),
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
process.env.AGENT_FOUNDATION_MODEL = 'anthropic.claude-haiku-4.5';
process.env.AGENT_MAX_ITERATIONS = '10';

// Import handlers after mocks
const { handler: chatHandler } = await import('./index.js');
const { handler: mcpServersHandler } = await import('../../../agent/mcp-servers/src/index.js');

type HandlerResult = { statusCode: number; body?: string; headers?: Record<string, string> };

// ── Helpers ────────────────────────────────────────────────────────────

function validConnectionItem() {
    const now = Math.floor(Date.now() / 1000);
    return {
        PK: 'CONNECTION#test-connection-id',
        SK: 'CONNECTION#test-connection-id',
        connectionId: 'test-connection-id',
        userId: 'user-123',
        connectedAt: now - 100,
        ttl: now + 600,
    };
}

function createChatEvent(body: any): APIGatewayProxyWebsocketEventV2 {
    return {
        requestContext: {
            connectionId: 'test-connection-id',
            domainName: 'test-domain.execute-api.us-east-1.amazonaws.com',
            stage: 'prod',
            identity: { sourceIp: '192.168.1.1', userAgent: 'test-agent' },
        } as any,
        body: JSON.stringify(body),
        isBase64Encoded: false,
    };
}

function createAdminApiEvent(method: string, name?: string, body?: any) {
    return {
        httpMethod: method,
        path: name ? `/agent/mcp-servers/${name}` : '/agent/mcp-servers',
        pathParameters: name ? { name } : null,
        body: body ? JSON.stringify(body) : null,
        requestContext: {
            authorizer: {
                userId: 'admin-user',
                roles: JSON.stringify(['admin']),
            },
        },
        headers: {},
        multiValueHeaders: {},
        isBase64Encoded: false,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        resource: '',
    } as any;
}

async function* fakeAgentStream(
    chunks: Array<{ type: string; text?: string; trace?: any; isComplete: boolean }>,
) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

const WEATHER_SERVER_CONFIG = {
    name: 'weather-api',
    transport: 'sse' as const,
    url: 'https://weather-mcp.example.com',
    enabled: true,
    description: 'Weather data tools',
};

const WEATHER_ACTION_GROUP = {
    actionGroupName: 'weather-api',
    description: 'Weather data tools',
    actionGroupExecutor: { customControl: 'RETURN_CONTROL' as const },
    functionSchema: {
        functions: [
            {
                name: 'get_forecast',
                description: 'Get weather forecast for a city',
                parameters: {
                    city: { type: 'string', description: 'City name', required: true },
                    days: { type: 'integer', description: 'Number of days', required: false },
                },
            },
        ],
    },
};

// ── Tests ──────────────────────────────────────────────────────────────

describe('MCP Server Management Integration (Task 34.2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
            allowed: true, remainingRequests: 59, resetAt: Date.now() + 60000,
        });
        mockMCPRegistryGetEnabledServers.mockResolvedValue([]);
        mockMCPRegistryListServers.mockResolvedValue([]);
        mockMCPRegistryGetServer.mockResolvedValue(null);
        mockMCPRegistryUpsertServer.mockResolvedValue(undefined);
        mockMCPRegistryDeleteServer.mockResolvedValue(undefined);
        mockMCPRegistryInvalidateCache.mockImplementation(() => {});
        mockMCPBridgeInitialize.mockResolvedValue(undefined);
        mockMCPBridgeDiscoverTools.mockResolvedValue([]);
        mockMCPBridgeToActionGroups.mockReturnValue([]);
        mockMCPBridgeDisconnect.mockResolvedValue(undefined);
        mockBedrockGenerateResponse.mockImplementation(async function* () {
            yield { text: 'Hello', isComplete: false };
            yield { text: '', isComplete: true, tokenCount: 5 };
        });
    });

    // ── 1. Add a new MCP server config via REST A