import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
    MCPServerConfig,
    MCPToolDefinition,
    MCPToolResult,
    ConnectedServer,
    ActionGroupConfig,
    FunctionDefinition,
} from './types';

/**
 * MCP Client Bridge — connects to configured MCP servers, discovers tools,
 * and routes tool execution requests to the correct server.
 *
 * Implements design component 15 (MCP Client Bridge).
 */
export class MCPClientBridge {
    private servers: Map<string, ConnectedServer> = new Map();

    /**
     * Initialize connections to all configured MCP servers.
     * Servers that fail to connect are logged and skipped.
     */
    async initialize(configs: MCPServerConfig[]): Promise<void> {
        const enabledConfigs = configs.filter((c) => c.enabled);

        const results = await Promise.allSettled(
            enabledConfigs.map((config) => this.connectServer(config)),
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const config = enabledConfigs[i];
            if (result.status === 'rejected') {
                console.error(
                    `[MCP Bridge] Failed to connect to server "${config.name}":`,
                    result.reason,
                );
            }
        }
    }

    /**
     * Discover tools from all connected MCP servers.
     * Returns a flat list of tool definitions across all servers.
     */
    async discoverTools(): Promise<MCPToolDefinition[]> {
        const allTools: MCPToolDefinition[] = [];

        for (const server of this.servers.values()) {
            try {
                const tools = await this.listServerTools(server);
                server.tools = tools;
                allTools.push(...tools);
            } catch (err) {
                console.error(
                    `[MCP Bridge] Failed to discover tools from "${server.name}":`,
                    err,
                );
            }
        }

        return allTools;
    }

    /**
     * Execute a tool on the appropriate MCP server.
     * Throws if the server or tool is not found.
     */
    async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<MCPToolResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            return {
                content: [{ type: 'text', text: `MCP server "${serverName}" is not connected` }],
                isError: true,
            };
        }

        try {
            const result = await server.client.callTool({ name: toolName, arguments: args });

            return {
                content: (result.content ?? []).map((item: any) => {
                    if (item.type === 'image') {
                        return { type: 'image', data: item.data, mimeType: item.mimeType };
                    }
                    return { type: 'text', text: String(item.text ?? '') };
                }),
                isError: result.isError ?? false,
            };
        } catch (err: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Tool execution failed: ${err.message ?? String(err)}`,
                    },
                ],
                isError: true,
            };
        }
    }

    /**
     * Disconnect all MCP server connections and clean up resources.
     */
    async disconnect(): Promise<void> {
        const disconnects = Array.from(this.servers.values()).map(async (server) => {
            try {
                await server.client.close();
            } catch (err) {
                console.error(
                    `[MCP Bridge] Error disconnecting from "${server.name}":`,
                    err,
                );
            }
        });

        await Promise.allSettled(disconnects);
        this.servers.clear();
    }

    /**
     * Get the list of currently connected server names.
     */
    getConnectedServers(): string[] {
        return Array.from(this.servers.keys());
    }

    /**
     * Get discovered tools for a specific server.
     */
    getServerTools(serverName: string): MCPToolDefinition[] {
        return this.servers.get(serverName)?.tools ?? [];
    }

    /**
     * Convert discovered MCP tools into Bedrock ActionGroupConfig[].
     * Each connected MCP server becomes one action group.
     * Tools are filtered by the server's toolFilter config.
     * Servers with no discovered tools are omitted.
     */
    toActionGroups(): ActionGroupConfig[] {
        const actionGroups: ActionGroupConfig[] = [];

        for (const server of this.servers.values()) {
            if (server.tools.length === 0) {
                continue;
            }

            const functions: FunctionDefinition[] = server.tools.map((tool) =>
                this.mcpToolToFunctionDef(tool),
            );

            actionGroups.push({
                actionGroupName: server.name,
                description:
                    server.config.description ??
                    `Tools from MCP server: ${server.name}`,
                actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
                functionSchema: { functions },
            });
        }

        return actionGroups;
    }

    // ── Private helpers ──────────────────────────────────────────

    /**
     * Convert a single MCP tool definition to a Bedrock FunctionDefinition.
     */
    private mcpToolToFunctionDef(tool: MCPToolDefinition): FunctionDefinition {
        const requiredSet = new Set(tool.inputSchema.required ?? []);
        const parameters: FunctionDefinition['parameters'] = {};

        for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
            parameters[key] = {
                type: prop.type,
                description: prop.description,
                required: requiredSet.has(key),
            };
        }

        return {
            name: tool.name,
            description: tool.description,
            parameters,
        };
    }

    private async connectServer(config: MCPServerConfig): Promise<void> {
        const transport = this.createTransport(config);
        const client = new Client(
            { name: `mcp-bridge-${config.name}`, version: '1.0.0' },
            { capabilities: {} },
        );

        await client.connect(transport);

        this.servers.set(config.name, {
            name: config.name,
            config,
            client,
            transport,
            tools: [],
        });
    }

    private createTransport(config: MCPServerConfig): any {
        switch (config.transport) {
            case 'stdio': {
                if (!config.command) {
                    throw new Error(`stdio transport requires "command" for server "${config.name}"`);
                }
                return new StdioClientTransport({
                    command: config.command,
                    args: config.args ?? [],
                    env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
                });
            }
            case 'sse': {
                if (!config.url) {
                    throw new Error(`sse transport requires "url" for server "${config.name}"`);
                }
                return new SSEClientTransport(new URL(config.url));
            }
            case 'streamable-http': {
                if (!config.url) {
                    throw new Error(
                        `streamable-http transport requires "url" for server "${config.name}"`,
                    );
                }
                return new StreamableHTTPClientTransport(new URL(config.url));
            }
            default:
                throw new Error(`Unsupported transport "${config.transport}" for server "${config.name}"`);
        }
    }

    private async listServerTools(server: ConnectedServer): Promise<MCPToolDefinition[]> {
        const response = await server.client.listTools();
        const rawTools: any[] = response.tools ?? [];

        // Apply toolFilter if configured
        const filtered = server.config.toolFilter?.length
            ? rawTools.filter((t: any) => server.config.toolFilter!.includes(t.name))
            : rawTools;

        return filtered.map((tool: any) => this.convertTool(server.name, tool));
    }

    private convertTool(serverName: string, tool: any): MCPToolDefinition {
        const schema = tool.inputSchema ?? { type: 'object', properties: {} };
        const properties: Record<string, { type: string; description: string }> = {};

        if (schema.properties) {
            for (const [key, value] of Object.entries(schema.properties)) {
                const prop = value as any;
                properties[key] = {
                    type: prop.type ?? 'string',
                    description: prop.description ?? '',
                };
            }
        }

        return {
            serverName,
            name: tool.name ?? 'unknown',
            description: tool.description ?? '',
            inputSchema: {
                type: 'object',
                properties,
                required: schema.required,
            },
        };
    }
}
