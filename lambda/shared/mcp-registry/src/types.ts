/**
 * Default argument hints for an MCP server's tools.
 * Stored alongside the server config to guide the agent on how to invoke tools.
 */
export interface MCPToolArgHints {
    /** Default key-value parameters to include in tool calls (e.g., engine, mode) */
    defaults?: Record<string, string>;
    /** Descriptions of common parameters for agent instruction building */
    paramDescriptions?: Record<string, string>;
}

/**
 * MCP Server configuration stored in DynamoDB
 */
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
    /** Default argument hints for this server's tools */
    toolArgHints?: MCPToolArgHints;
}

/**
 * DynamoDB record structure for MCP server configs
 * PK: MCP#<serverName>, SK: CONFIG
 */
export interface MCPServerConfigRecord {
    PK: string;
    SK: string;
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

/**
 * Configuration for the MCP Tool Registry
 */
export interface MCPRegistryConfig {
    tableName: string;
    cacheTtlMs: number;
}
