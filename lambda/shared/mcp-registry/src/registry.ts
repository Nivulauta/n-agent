import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    DeleteCommand,
    ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { MCPServerConfig, MCPServerConfigRecord, MCPRegistryConfig } from './types';

const PK_PREFIX = 'MCP#';
const SK_VALUE = 'CONFIG';

/**
 * MCP Tool Registry — CRUD operations for MCP server configurations
 * stored in DynamoDB with in-memory caching for enabled servers.
 *
 * Implements Requirement 16.1: Runtime MCP server management
 */
export class MCPToolRegistry {
    private docClient: DynamoDBDocumentClient;
    private config: MCPRegistryConfig;

    // In-memory cache for getEnabledServers
    private enabledCache: MCPServerConfig[] | null = null;
    private enabledCacheExpiry = 0;

    constructor(config: Partial<MCPRegistryConfig> = {}) {
        const dynamoClient = new DynamoDBClient({});
        this.docClient = DynamoDBDocumentClient.from(dynamoClient);

        this.config = {
            tableName: config.tableName || process.env.MCP_SERVER_CONFIG_TABLE || 'MCPServerConfig',
            cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000, // 5 minutes
        };
    }

    /**
     * List all registered MCP server configurations
     */
    async listServers(): Promise<MCPServerConfig[]> {
        const result = await this.docClient.send(
            new ScanCommand({
                TableName: this.config.tableName,
                FilterExpression: 'SK = :sk',
                ExpressionAttributeValues: { ':sk': SK_VALUE },
            }),
        );

        return (result.Items || []).map((item) => this.toConfig(item as MCPServerConfigRecord));
    }

    /**
     * Get a specific server configuration by name
     */
    async getServer(name: string): Promise<MCPServerConfig | null> {
        const result = await this.docClient.send(
            new GetCommand({
                TableName: this.config.tableName,
                Key: { PK: `${PK_PREFIX}${name}`, SK: SK_VALUE },
            }),
        );

        if (!result.Item) return null;
        return this.toConfig(result.Item as MCPServerConfigRecord);
    }

    /**
     * Register or update an MCP server configuration
     */
    async upsertServer(serverConfig: MCPServerConfig): Promise<void> {
        const record: MCPServerConfigRecord = {
            PK: `${PK_PREFIX}${serverConfig.name}`,
            SK: SK_VALUE,
            ...serverConfig,
        };

        await this.docClient.send(
            new PutCommand({
                TableName: this.config.tableName,
                Item: record,
            }),
        );

        this.invalidateCache();
    }

    /**
     * Remove an MCP server configuration
     */
    async deleteServer(name: string): Promise<void> {
        await this.docClient.send(
            new DeleteCommand({
                TableName: this.config.tableName,
                Key: { PK: `${PK_PREFIX}${name}`, SK: SK_VALUE },
            }),
        );

        this.invalidateCache();
    }

    /**
     * Get all enabled server configurations.
     * Results are cached in Lambda memory with a 5-minute TTL.
     */
    async getEnabledServers(): Promise<MCPServerConfig[]> {
        const now = Date.now();

        if (this.enabledCache && now < this.enabledCacheExpiry) {
            return this.enabledCache;
        }

        const result = await this.docClient.send(
            new ScanCommand({
                TableName: this.config.tableName,
                FilterExpression: 'SK = :sk AND enabled = :enabled',
                ExpressionAttributeValues: { ':sk': SK_VALUE, ':enabled': true },
            }),
        );

        const servers = (result.Items || []).map((item) => this.toConfig(item as MCPServerConfigRecord));

        this.enabledCache = servers;
        this.enabledCacheExpiry = now + this.config.cacheTtlMs;

        return servers;
    }

    /**
     * Invalidate the in-memory cache (called after writes)
     */
    invalidateCache(): void {
        this.enabledCache = null;
        this.enabledCacheExpiry = 0;
    }

    /**
     * Convert a DynamoDB record to an MCPServerConfig
     */
    private toConfig(record: MCPServerConfigRecord): MCPServerConfig {
        return {
            name: record.name,
            transport: record.transport,
            enabled: record.enabled,
            ...(record.command !== undefined && { command: record.command }),
            ...(record.args !== undefined && { args: record.args }),
            ...(record.url !== undefined && { url: record.url }),
            ...(record.env !== undefined && { env: record.env }),
            ...(record.toolFilter !== undefined && { toolFilter: record.toolFilter }),
            ...(record.description !== undefined && { description: record.description }),
            ...(record.builtin !== undefined && { builtin: record.builtin }),
            ...(record.toolArgHints !== undefined && { toolArgHints: record.toolArgHints }),
        };
    }
}
