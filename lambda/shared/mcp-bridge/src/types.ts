/**
 * Types for the MCP Client Bridge module.
 * Re-exports MCPServerConfig from mcp-registry for convenience.
 */

/** Default argument hints for an MCP server's tools */
export interface MCPToolArgHints {
    /** Default key-value parameters to include in tool calls */
    defaults?: Record<string, string>;
    /** Descriptions of common parameters for agent instruction building */
    paramDescriptions?: Record<string, string>;
}

/** Re-export the server config type from the registry module */
export interface MCPServerConfig {
    name: string;
    transport: 'stdio' | 'sse' | 'streamable-http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled: boolean;
    toolFilter?: string[];
    description?: string;
    builtin?: boolean;
    toolArgHints?: MCPToolArgHints;
}

/** A tool definition discovered from an MCP server */
export interface MCPToolDefinition {
    serverName: string;
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required?: string[];
    };
}

/** Result returned from executing an MCP tool */
export interface MCPToolResult {
    content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
    >;
    isError?: boolean;
}

/** Internal state for a connected MCP server */
export interface ConnectedServer {
    name: string;
    config: MCPServerConfig;
    client: any; // MCP Client instance
    transport: any; // MCP Transport instance
    tools: MCPToolDefinition[];
}

/** Bedrock action group configuration for InvokeInlineAgent */
export interface ActionGroupConfig {
    actionGroupName: string;
    description: string;
    actionGroupExecutor?: {
        customControl: 'RETURN_CONTROL';
    };
    functionSchema: {
        functions: FunctionDefinition[];
    };
}

/** Bedrock function definition within an action group */
export interface FunctionDefinition {
    name: string;
    description: string;
    parameters: Record<
        string,
        {
            type: string;
            description: string;
            required: boolean;
        }
    >;
}

/** Bedrock action group configuration for InvokeInlineAgent */
export interface ActionGroupConfig {
    actionGroupName: string;
    description: string;
    actionGroupExecutor?: {
        customControl: 'RETURN_CONTROL';
    };
    functionSchema: {
        functions: FunctionDefinition[];
    };
}

/** Bedrock function definition within an action group */
export interface FunctionDefinition {
    name: string;
    description: string;
    parameters: Record<
        string,
        {
            type: string;
            description: string;
            required: boolean;
        }
    >;
}

