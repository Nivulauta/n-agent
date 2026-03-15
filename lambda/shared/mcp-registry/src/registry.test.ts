import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPToolRegistry } from './registry';
import { MCPServerConfig } from './types';

// Mock AWS SDK
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
    GetCommand: vi.fn((input: any) => ({ input, _type: 'Get' })),
    PutCommand: vi.fn((input: any) => ({ input, _type: 'Put' })),
    DeleteCommand: vi.fn((input: any) => ({ input, _type: 'Delete' })),
    ScanCommand: vi.fn((input: any) => ({ input, _type: 'Scan' })),
}));

const sampleStdioServer: MCPServerConfig = {
    name: 'test-server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    enabled: true,
    description: 'A test MCP server',
};

const sampleSseServer: MCPServerConfig = {
    name: 'remote-server',
    transport: 'sse',
    url: 'https://mcp.example.com/sse',
    enabled: true,
    description: 'A remote SSE server',
    toolFilter: ['search', 'summarize'],
};

const sampleDisabledServer: MCPServerConfig = {
    name: 'disabled-server',
    transport: 'stdio',
    command: 'python',
    args: ['server.py'],
    enabled: false,
};

function makeDynamoRecord(config: MCPServerConfig) {
    return { PK: `MCP#${config.name}`, SK: 'CONFIG', ...config };
}

describe('MCPToolRegistry', () => {
    let registry: MCPToolRegistry;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        registry = new MCPToolRegistry({ tableName: 'TestTable', cacheTtlMs: 5000 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── CRUD: listServers ──────────────────────────────────────────────

    describe('listServers', () => {
        it('returns all server configs from DynamoDB', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });

            const servers = await registry.listServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('test-server');
            expect(servers[0].transport).toBe('stdio');
        });

        it('returns empty array when no items exist', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });
            const servers = await registry.listServers();
            expect(servers).toHaveLength(0);
        });

        it('handles undefined Items gracefully', async () => {
            mockSend.mockResolvedValueOnce({ Items: undefined });
            const servers = await registry.listServers();
            expect(servers).toHaveLength(0);
        });

        it('returns multiple servers of different transports', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [
                    makeDynamoRecord(sampleStdioServer),
                    makeDynamoRecord(sampleSseServer),
                    makeDynamoRecord(sampleDisabledServer),
                ],
            });

            const servers = await registry.listServers();
            expect(servers).toHaveLength(3);
            expect(servers.map((s) => s.name).sort()).toEqual(
                ['disabled-server', 'remote-server', 'test-server'],
            );
        });

        it('sends ScanCommand with correct table name and filter', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });
            await registry.listServers();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const cmd = mockSend.mock.calls[0][0];
            expect(cmd.input.TableName).toBe('TestTable');
            expect(cmd.input.FilterExpression).toBe('SK = :sk');
            expect(cmd.input.ExpressionAttributeValues).toEqual({ ':sk': 'CONFIG' });
        });
    });

    // ── CRUD: getServer ────────────────────────────────────────────────

    describe('getServer', () => {
        it('returns config when server exists', async () => {
            mockSend.mockResolvedValueOnce({
                Item: makeDynamoRecord(sampleStdioServer),
            });

            const server = await registry.getServer('test-server');
            expect(server).not.toBeNull();
            expect(server!.name).toBe('test-server');
            expect(server!.command).toBe('node');
            expect(server!.args).toEqual(['server.js']);
        });

        it('returns null when server does not exist', async () => {
            mockSend.mockResolvedValueOnce({ Item: undefined });
            const server = await registry.getServer('nonexistent');
            expect(server).toBeNull();
        });

        it('sends GetCommand with correct PK and SK', async () => {
            mockSend.mockResolvedValueOnce({ Item: undefined });
            await registry.getServer('my-server');

            const cmd = mockSend.mock.calls[0][0];
            expect(cmd.input.TableName).toBe('TestTable');
            expect(cmd.input.Key).toEqual({ PK: 'MCP#my-server', SK: 'CONFIG' });
        });

        it('returns SSE server with url and toolFilter', async () => {
            mockSend.mockResolvedValueOnce({
                Item: makeDynamoRecord(sampleSseServer),
            });

            const server = await registry.getServer('remote-server');
            expect(server!.transport).toBe('sse');
            expect(server!.url).toBe('https://mcp.example.com/sse');
            expect(server!.toolFilter).toEqual(['search', 'summarize']);
        });
    });

    // ── CRUD: upsertServer ─────────────────────────────────────────────

    describe('upsertServer', () => {
        it('sends PutCommand with correct PK, SK, and config fields', async () => {
            mockSend.mockResolvedValueOnce({});
            await registry.upsertServer(sampleStdioServer);

            expect(mockSend).toHaveBeenCalledTimes(1);
            const cmd = mockSend.mock.calls[0][0];
            expect(cmd.input.TableName).toBe('TestTable');
            expect(cmd.input.Item.PK).toBe('MCP#test-server');
            expect(cmd.input.Item.SK).toBe('CONFIG');
            expect(cmd.input.Item.name).toBe('test-server');
            expect(cmd.input.Item.transport).toBe('stdio');
            expect(cmd.input.Item.enabled).toBe(true);
        });

        it('invalidates the enabled-servers cache after upsert', async () => {
            // Prime the cache
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });
            await registry.getEnabledServers();
            expect(mockSend).toHaveBeenCalledTimes(1);

            // Upsert a new server — should invalidate cache
            mockSend.mockResolvedValueOnce({});
            await registry.upsertServer(sampleSseServer);

            // Next getEnabledServers should hit DynamoDB again
            mockSend.mockResolvedValueOnce({
                Items: [
                    makeDynamoRecord(sampleStdioServer),
                    makeDynamoRecord(sampleSseServer),
                ],
            });
            const servers = await registry.getEnabledServers();
            expect(servers).toHaveLength(2);
            expect(mockSend).toHaveBeenCalledTimes(3); // scan + put + scan
        });
    });

    // ── CRUD: deleteServer ─────────────────────────────────────────────

    describe('deleteServer', () => {
        it('sends DeleteCommand with correct PK and SK', async () => {
            mockSend.mockResolvedValueOnce({});
            await registry.deleteServer('test-server');

            expect(mockSend).toHaveBeenCalledTimes(1);
            const cmd = mockSend.mock.calls[0][0];
            expect(cmd.input.TableName).toBe('TestTable');
            expect(cmd.input.Key).toEqual({ PK: 'MCP#test-server', SK: 'CONFIG' });
        });

        it('invalidates the enabled-servers cache after delete', async () => {
            // Prime the cache
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });
            await registry.getEnabledServers();

            // Delete — should invalidate cache
            mockSend.mockResolvedValueOnce({});
            await registry.deleteServer('test-server');

            // Next getEnabledServers should hit DynamoDB again
            mockSend.mockResolvedValueOnce({ Items: [] });
            const servers = await registry.getEnabledServers();
            expect(servers).toHaveLength(0);
            expect(mockSend).toHaveBeenCalledTimes(3); // scan + delete + scan
        });
    });

    // ── getEnabledServers filtering ────────────────────────────────────

    describe('getEnabledServers', () => {
        it('returns only enabled servers', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });

            const servers = await registry.getEnabledServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('test-server');
            expect(servers[0].enabled).toBe(true);
        });

        it('sends ScanCommand with enabled filter expression', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });
            await registry.getEnabledServers();

            const cmd = mockSend.mock.calls[0][0];
            expect(cmd.input.FilterExpression).toBe('SK = :sk AND enabled = :enabled');
            expect(cmd.input.ExpressionAttributeValues).toEqual({
                ':sk': 'CONFIG',
                ':enabled': true,
            });
        });

        it('returns empty array when no servers are enabled', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });
            const servers = await registry.getEnabledServers();
            expect(servers).toHaveLength(0);
        });

        it('returns multiple enabled servers', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [
                    makeDynamoRecord(sampleStdioServer),
                    makeDynamoRecord(sampleSseServer),
                ],
            });

            const servers = await registry.getEnabledServers();
            expect(servers).toHaveLength(2);
        });
    });

    // ── Caching behavior ───────────────────────────────────────────────

    describe('caching behavior', () => {
        it('returns cached results within TTL window', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });

            const first = await registry.getEnabledServers();
            const second = await registry.getEnabledServers();

            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(first).toEqual(second);
        });

        it('refreshes cache after TTL expires', async () => {
            mockSend
                .mockResolvedValueOnce({
                    Items: [makeDynamoRecord(sampleStdioServer)],
                })
                .mockResolvedValueOnce({
                    Items: [makeDynamoRecord(sampleSseServer)],
                });

            const first = await registry.getEnabledServers();
            expect(first[0].name).toBe('test-server');

            // Advance time past the 5000ms TTL
            vi.advanceTimersByTime(5001);

            const second = await registry.getEnabledServers();
            expect(second[0].name).toBe('remote-server');
            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('still serves cache just before TTL expires', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [makeDynamoRecord(sampleStdioServer)],
            });

            await registry.getEnabledServers();

            // Advance time to just under the TTL
            vi.advanceTimersByTime(4999);

            await registry.getEnabledServers();
            expect(mockSend).toHaveBeenCalledTimes(1); // still cached
        });

        it('refreshes cache after explicit invalidation', async () => {
            mockSend
                .mockResolvedValueOnce({
                    Items: [{ PK: 'MCP#v1', SK: 'CONFIG', name: 'v1', transport: 'stdio', enabled: true }],
                })
                .mockResolvedValueOnce({
                    Items: [{ PK: 'MCP#v2', SK: 'CONFIG', name: 'v2', transport: 'stdio', enabled: true }],
                });

            const first = await registry.getEnabledServers();
            expect(first[0].name).toBe('v1');

            registry.invalidateCache();

            const second = await registry.getEnabledServers();
            expect(second[0].name).toBe('v2');
            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });

    // ── toConfig field stripping ───────────────────────────────────────

    describe('toConfig stripping', () => {
        it('omits undefined optional fields from the result', async () => {
            mockSend.mockResolvedValueOnce({
                Item: { PK: 'MCP#minimal', SK: 'CONFIG', name: 'minimal', transport: 'sse', enabled: false },
            });

            const server = await registry.getServer('minimal');
            expect(server).toEqual({ name: 'minimal', transport: 'sse', enabled: false });
            expect(server).not.toHaveProperty('command');
            expect(server).not.toHaveProperty('args');
            expect(server).not.toHaveProperty('url');
            expect(server).not.toHaveProperty('env');
            expect(server).not.toHaveProperty('toolFilter');
            expect(server).not.toHaveProperty('description');
            expect(server).not.toHaveProperty('builtin');
        });

        it('includes all optional fields when present', async () => {
            const fullConfig: MCPServerConfig = {
                name: 'full',
                transport: 'streamable-http',
                command: 'npx',
                args: ['-y', 'server'],
                url: 'https://full.example.com',
                env: { API_KEY: 'secret' },
                enabled: true,
                toolFilter: ['tool-a'],
                description: 'Full config',
                builtin: true,
            };
            mockSend.mockResolvedValueOnce({
                Item: makeDynamoRecord(fullConfig),
            });

            const server = await registry.getServer('full');
            expect(server).toEqual(fullConfig);
        });
    });
});
