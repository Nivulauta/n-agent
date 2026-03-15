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
}

/**
 * Configuration for the MCP Tool Registry
 */
export interface MCPRegistryConfig {
    tableName: string;
    cacheTtlMs: number;
}
