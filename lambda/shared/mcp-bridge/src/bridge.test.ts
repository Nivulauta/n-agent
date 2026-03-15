import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPClientBridge } from './bridge';
import { MCPServerConfig, MCPToolDefinition } from './types';

// ── Mock MCP SDK ───────────────────────────────────────────────────────

const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: vi.fn(() => ({
        connect: mockConnect,
        close: mockClose,
        listTools: mockListTools,
        callTool: mockCallTool,
    })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: vi.fn((opts: any) => ({ type: 'stdio', ...opts })),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
    SSEClientTransport: vi.fn((url: any) => ({ type: 'sse', url })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: vi.fn((url: any) => ({ type: 'streamable-http', url })),
}));

// ── Fixtures ───────────────────────────────────────────────────────────

const stdioConfig: MCPServerConfig = {
    name: 'local-tools',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    enabled: true,
    description: 'Local tool server',
};

const sseConfig: MCPServerConfig = {
    name: 'remote-tools',
    transport: 'sse',
    url: 'https://mcp.example.com/sse',
    enabled: true,
    description: 'Remote SSE server',
};

const filteredConfig: MCPServerConfig = {
    name: 'filtered-server',
    transport: 'stdio',
    command: 'python',
    args: ['server.py'],
    enabled: true,
    toolFilter: ['search', 'summarize'],
    description: 'Server with tool filter',
};

const disabledConfig: MCPServerConfig = {
    name: 'disabled-server',
    transport: 'stdio',
    command: 'node',
    args: ['disabled.js'],
    enabled: false,
};

function makeMCPToolResponse(tools: Array<{ name: string; description: string; inputSchema?: any }>) {
    return {
        tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema ?? {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
            },
        })),
    };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('MCPClientBridge', () => {
    let bridge: MCPClientBridge;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConnect.mockResolvedValue(undefined);
        mockClose.mockResolvedValue(undefined);
        bridge = new MCPClientBridge();
    });

    afterEach(async () => {
        await bridge.disconnect();
    });

    // ── initialize ─────────────────────────────────────────────────────

    describe('initialize', () => {
        it('connects to all enabled servers', async () => {
            await bridge.initialize([stdioConfig, sseConfig]);

            expect(mockConnect).toHaveBeenCalledTimes(2);
            expect(bridge.getConnectedServers()).toEqual(['local-tools', 'remote-tools']);
        });

        it('skips disabled servers', async () => {
            await bridge.initialize([stdioConfig, disabledConfig]);

            expect(mockConnect).toHaveBeenCalledTimes(1);
            expect(bridge.getConnectedServers()).toEqual(['local-tools']);
        });

        it('continues when a server fails to connect', async () => {
            mockConnect
                .mockRejectedValueOnce(new Error('Connection refused'))
                .mockResolvedValueOnce(undefined);

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await bridge.initialize([stdioConfig, sseConfig]);

            expect(bridge.getConnectedServers()).toEqual(['remote-tools']);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to connect'),
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });

        it('handles empty config list', async () => {
            await bridge.initialize([]);
            expect(bridge.getConnectedServers()).toEqual([]);
            expect(mockConnect).not.toHaveBeenCalled();
        });

        it('handles all servers failing to connect', async () => {
            mockConnect.mockRejectedValue(new Error('fail'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await bridge.initialize([stdioConfig, sseConfig]);

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });
    });

    // ── discoverTools ──────────────────────────────────────────────────

    describe('discoverTools', () => {
        it('returns tools from all connected servers', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    { name: 'search', description: 'Search documents' },
                    { name: 'summarize', description: 'Summarize text' },
                ]),
            );

            await bridge.initialize([stdioConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(2);
            expect(tools[0].serverName).toBe('local-tools');
            expect(tools[0].name).toBe('search');
            expect(tools[1].name).toBe('summarize');
        });

        it('aggregates tools from multiple servers', async () => {
            mockListTools
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-a', description: 'A' }]))
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-b', description: 'B' }]));

            await bridge.initialize([stdioConfig, sseConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(2);
            expect(tools.map((t) => t.name)).toEqual(['tool-a', 'tool-b']);
        });

        it('converts MCP tool schema to MCPToolDefinition format', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    {
                        name: 'complex-tool',
                        description: 'A complex tool',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'The query' },
                                limit: { type: 'integer', description: 'Max results' },
                            },
                            required: ['query'],
                        },
                    },
                ]),
            );

            await bridge.initialize([stdioConfig]);
            const tools = await bridge.discoverTools();

            expect(tools[0]).toEqual({
                serverName: 'local-tools',
                name: 'complex-tool',
                description: 'A complex tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The query' },
                        limit: { type: 'integer', description: 'Max results' },
                    },
                    required: ['query'],
                },
            });
        });

        it('handles server that returns no tools', async () => {
            mockListTools.mockResolvedValue({ tools: [] });

            await bridge.initialize([stdioConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(0);
        });

        it('continues discovery when one server fails', async () => {
            mockListTools
                .mockRejectedValueOnce(new Error('Server error'))
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-b', description: 'B' }]));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await bridge.initialize([stdioConfig, sseConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(1);
            expect(tools[0].name).toBe('tool-b');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to discover tools'),
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });

        it('handles tools with missing inputSchema gracefully', async () => {
            mockListTools.mockResolvedValue({
                tools: [{ name: 'bare-tool', description: 'No schema' }],
            });

            await bridge.initialize([stdioConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(1);
            expect(tools[0].inputSchema.properties).toEqual({});
        });
    });

    // ── toolFilter ─────────────────────────────────────────────────────

    describe('toolFilter', () => {
        it('filters tools based on server toolFilter config', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    { name: 'search', description: 'Search' },
                    { name: 'summarize', description: 'Summarize' },
                    { name: 'delete', description: 'Delete' },
                ]),
            );

            await bridge.initialize([filteredConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(2);
            expect(tools.map((t) => t.name).sort()).toEqual(['search', 'summarize']);
        });

        it('returns all tools when no toolFilter is set', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    { name: 'search', description: 'Search' },
                    { name: 'summarize', description: 'Summarize' },
                    { name: 'delete', description: 'Delete' },
                ]),
            );

            await bridge.initialize([stdioConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(3);
        });

        it('returns empty when toolFilter matches no tools', async () => {
            const noMatchConfig: MCPServerConfig = {
                ...stdioConfig,
                name: 'no-match',
                toolFilter: ['nonexistent-tool'],
            };

            mockListTools.mockResolvedValue(
                makeMCPToolResponse([{ name: 'search', description: 'Search' }]),
            );

            await bridge.initialize([noMatchConfig]);
            const tools = await bridge.discoverTools();

            expect(tools).toHaveLength(0);
        });
    });

    // ── executeTool ────────────────────────────────────────────────────

    describe('executeTool', () => {
        it('routes tool call to the correct server', async () => {
            mockCallTool.mockResolvedValue({
                content: [{ type: 'text', text: 'result data' }],
                isError: false,
            });

            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('local-tools', 'search', { query: 'test' });

            expect(mockCallTool).toHaveBeenCalledWith({
                name: 'search',
                arguments: { query: 'test' },
            });
            expect(result).toEqual({
                content: [{ type: 'text', text: 'result data' }],
                isError: false,
            });
        });

        it('returns error for unknown server', async () => {
            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('nonexistent', 'search', {});

            expect(result.isError).toBe(true);
            expect(result.content[0]).toEqual({
                type: 'text',
                text: 'MCP server "nonexistent" is not connected',
            });
        });

        it('handles tool execution failure gracefully', async () => {
            mockCallTool.mockRejectedValue(new Error('Tool crashed'));

            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('local-tools', 'search', { query: 'test' });

            expect(result.isError).toBe(true);
            expect(result.content[0]).toEqual({
                type: 'text',
                text: 'Tool execution failed: Tool crashed',
            });
        });

        it('handles image content in tool response', async () => {
            mockCallTool.mockResolvedValue({
                content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
                isError: false,
            });

            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('local-tools', 'screenshot', {});

            expect(result.content[0]).toEqual({
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png',
            });
        });

        it('handles mixed content types in response', async () => {
            mockCallTool.mockResolvedValue({
                content: [
                    { type: 'text', text: 'Here is the chart:' },
                    { type: 'image', data: 'abc123', mimeType: 'image/jpeg' },
                ],
                isError: false,
            });

            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('local-tools', 'chart', {});

            expect(result.content).toHaveLength(2);
            expect(result.content[0]).toEqual({ type: 'text', text: 'Here is the chart:' });
            expect(result.content[1]).toEqual({ type: 'image', data: 'abc123', mimeType: 'image/jpeg' });
        });

        it('handles response with null content gracefully', async () => {
            mockCallTool.mockResolvedValue({ content: null, isError: false });

            await bridge.initialize([stdioConfig]);
            const result = await bridge.executeTool('local-tools', 'noop', {});

            expect(result.content).toEqual([]);
            expect(result.isError).toBe(false);
        });
    });

    // ── toActionGroups (schema translation) ────────────────────────────

    describe('toActionGroups', () => {
        it('converts MCP tools to Bedrock action group format', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    {
                        name: 'search',
                        description: 'Search documents',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Search query' },
                                limit: { type: 'integer', description: 'Max results' },
                            },
                            required: ['query'],
                        },
                    },
                ]),
            );

            await bridge.initialize([stdioConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();

            expect(actionGroups).toHaveLength(1);
            expect(actionGroups[0]).toEqual({
                actionGroupName: 'local-tools',
                description: 'Local tool server',
                actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
                functionSchema: {
                    functions: [
                        {
                            name: 'search',
                            description: 'Search documents',
                            parameters: {
                                query: { type: 'string', description: 'Search query', required: true },
                                limit: { type: 'integer', description: 'Max results', required: false },
                            },
                        },
                    ],
                },
            });
        });

        it('creates one action group per connected server', async () => {
            mockListTools
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-a', description: 'A' }]))
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-b', description: 'B' }]));

            await bridge.initialize([stdioConfig, sseConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();

            expect(actionGroups).toHaveLength(2);
            expect(actionGroups[0].actionGroupName).toBe('local-tools');
            expect(actionGroups[1].actionGroupName).toBe('remote-tools');
        });

        it('omits servers with no discovered tools', async () => {
            mockListTools
                .mockResolvedValueOnce(makeMCPToolResponse([{ name: 'tool-a', description: 'A' }]))
                .mockResolvedValueOnce({ tools: [] });

            await bridge.initialize([stdioConfig, sseConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();

            expect(actionGroups).toHaveLength(1);
            expect(actionGroups[0].actionGroupName).toBe('local-tools');
        });

        it('uses server description as action group description', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([{ name: 'tool', description: 'A tool' }]),
            );

            await bridge.initialize([sseConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();

            expect(actionGroups[0].description).toBe('Remote SSE server');
        });

        it('uses fallback description when server has no description', async () => {
            const noDescConfig: MCPServerConfig = {
                name: 'no-desc',
                transport: 'stdio',
                command: 'node',
                args: ['s.js'],
                enabled: true,
            };

            mockListTools.mockResolvedValue(
                makeMCPToolResponse([{ name: 'tool', description: 'A tool' }]),
            );

            await bridge.initialize([noDescConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();

            expect(actionGroups[0].description).toBe('Tools from MCP server: no-desc');
        });

        it('maps required fields correctly from MCP schema', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([
                    {
                        name: 'multi-param',
                        description: 'Multi param tool',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                a: { type: 'string', description: 'Required param' },
                                b: { type: 'string', description: 'Optional param' },
                                c: { type: 'integer', description: 'Also required' },
                            },
                            required: ['a', 'c'],
                        },
                    },
                ]),
            );

            await bridge.initialize([stdioConfig]);
            await bridge.discoverTools();
            const actionGroups = bridge.toActionGroups();
            const params = actionGroups[0].functionSchema.functions[0].parameters;

            expect(params.a.required).toBe(true);
            expect(params.b.required).toBe(false);
            expect(params.c.required).toBe(true);
        });

        it('returns empty array when no servers are connected', () => {
            const actionGroups = bridge.toActionGroups();
            expect(actionGroups).toEqual([]);
        });
    });

    // ── disconnect ─────────────────────────────────────────────────────

    describe('disconnect', () => {
        it('closes all connected clients', async () => {
            await bridge.initialize([stdioConfig, sseConfig]);
            await bridge.disconnect();

            expect(mockClose).toHaveBeenCalledTimes(2);
            expect(bridge.getConnectedServers()).toEqual([]);
        });

        it('handles close errors gracefully', async () => {
            mockClose.mockRejectedValue(new Error('Close failed'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await bridge.initialize([stdioConfig]);
            await bridge.disconnect();

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('is safe to call when no servers are connected', async () => {
            await bridge.disconnect();
            expect(mockClose).not.toHaveBeenCalled();
        });
    });

    // ── getServerTools ─────────────────────────────────────────────────

    describe('getServerTools', () => {
        it('returns tools for a specific server after discovery', async () => {
            mockListTools.mockResolvedValue(
                makeMCPToolResponse([{ name: 'search', description: 'Search' }]),
            );

            await bridge.initialize([stdioConfig]);
            await bridge.discoverTools();

            const tools = bridge.getServerTools('local-tools');
            expect(tools).toHaveLength(1);
            expect(tools[0].name).toBe('search');
        });

        it('returns empty array for unknown server', () => {
            const tools = bridge.getServerTools('nonexistent');
            expect(tools).toEqual([]);
        });
    });

    // ── Transport creation ─────────────────────────────────────────────

    describe('transport creation', () => {
        it('throws for stdio transport without command', async () => {
            const badConfig: MCPServerConfig = {
                name: 'bad-stdio',
                transport: 'stdio',
                enabled: true,
            };

            mockConnect.mockRejectedValue(new Error('stdio transport requires "command"'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await bridge.initialize([badConfig]);

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('throws for sse transport without url', async () => {
            const badConfig: MCPServerConfig = {
                name: 'bad-sse',
                transport: 'sse',
                enabled: true,
            };

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await bridge.initialize([badConfig]);

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('throws for streamable-http transport without url', async () => {
            const badConfig: MCPServerConfig = {
                name: 'bad-http',
                transport: 'streamable-http',
                enabled: true,
            };

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await bridge.initialize([badConfig]);

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('throws for unsupported transport type', async () => {
            const badConfig = {
                name: 'bad-transport',
                transport: 'grpc' as any,
                enabled: true,
            };

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await bridge.initialize([badConfig]);

            expect(bridge.getConnectedServers()).toEqual([]);
            consoleSpy.mockRestore();
        });
    });
});
