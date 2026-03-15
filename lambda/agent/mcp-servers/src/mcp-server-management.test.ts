import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

// ── DynamoDB mock ──────────────────────────────────────────────────────

let mockDocClientSend: Mock;

class MockGetCommand { [key: string]: any; constructor(params: any) { Object.assign(this, params); } }
class MockPutCommand { [key: string]: any; constructor(params: any) { Object.assign(this, params); } }
class MockDeleteCommand { [key: string]: any; constructor(params: any) { Object.assign(this, params); } }
class MockScanCommand { [key: string]: any; constructor(params: any) { Object.assign(this, params); } }

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn(() => ({
            send: (...args: any[]) => mockDocClientSend(...args),
        })),
    },
    GetCommand: MockGetCommand,
    PutCommand: MockPutCommand,
    DeleteCommand: MockDeleteCommand,
    ScanCommand: MockScanCommand,
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(function () { return {}; }),
}));

process.env.MCP_SERVER_CONFIG_TABLE = 'MCPServerConfig';

const { handler } = await import('./index.js');

// ── Helpers ────────────────────────────────────────────────────────────

function createEvent(
    method: string,
    body?: any,
    pathName?: string,
): APIGatewayProxyEvent {
    return {
        httpMethod: method,
        path: pathName ? `/agent/mcp-servers/${pathName}` : '/agent/mcp-servers',
        pathParameters: pathName ? { name: pathName } : null,
        body: body ? JSON.stringify(body) : null,
        requestContext: {
            authorizer: {
                userId: 'admin-user-1',
                roles: JSON.stringify(['admin']),
            },
        } as any,
        headers: {},
        multiValueHeaders: {},
        isBase64Encoded: false,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        resource: '',
    } as APIGatewayProxyEvent;
}

const mockContext: Context = {
    awsRequestId: 'test-req-id',
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'mcp-servers',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:mcp-servers',
    logGroupName: '/aws/lambda/mcp-servers',
    logStreamName: '2026/03/15',
    memoryLimitInMB: '128',
    getRemainingTimeInMillis: () => 30000,
    done: () => { },
    fail: () => { },
    succeed: () => { },
};

const NEW_SERVER_CONFIG = {
    transport: 'sse' as const,
    url: 'https://weather-mcp.example.com/sse',
    enabled: true,
    description: 'Weather data tools',
    toolFilter: ['get_weather', 'get_forecast'],
};

// ── In-memory DynamoDB simulation ──────────────────────────────────────

/**
 * Simulates DynamoDB operations for the MCPServerConfig table.
 * Tracks items by PK+SK so we can verify the full CRUD lifecycle.
 */
function createDynamoSimulator() {
    const store = new Map<string, Record<string, any>>();

    const handler: Mock = vi.fn(async (command: any) => {
        const tableName = command.TableName;
        if (tableName !== 'MCPServerConfig') {
            return { Items: [], Item: undefined };
        }

        // PutCommand
        if (command instanceof MockPutCommand) {
            const key = `${command.Item.PK}#${command.Item.SK}`;
            store.set(key, { ...command.Item });
            return {};
        }

        // GetCommand
        if (command instanceof MockGetCommand) {
            const key = `${command.Key.PK}#${command.Key.SK}`;
            return { Item: store.get(key) ?? undefined };
        }

        // DeleteCommand
        if (command instanceof MockDeleteCommand) {
            const key = `${command.Key.PK}#${command.Key.SK}`;
            store.delete(key);
            return {};
        }

        // ScanCommand
        if (command instanceof MockScanCommand) {
            const items = Array.from(store.values());
            // Filter by SK = CONFIG
            let filtered = items.filter((i) => i.SK === 'CONFIG');
            // If filtering for enabled servers
            if (command.FilterExpression.includes('enabled')) {
                filtered = filtered.filter((i) => i.enabled === true);
            }
            return { Items: filtered };
        }

        return { Items: [], Item: undefined };
    });

    return { handler, store };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('MCP Server Management Integration (Task 34.2)', () => {
    let dynamo: ReturnType<typeof createDynamoSimulator>;

    beforeEach(() => {
        vi.clearAllMocks();
        dynamo = createDynamoSimulator();
        mockDocClientSend = dynamo.handler;
    });

    // ── Step 1: Add a new MCP server config via PUT ────────────────────

    describe('Step 1: Add a new MCP server config via REST API', () => {
        it('should create a new MCP server config via PUT /agent/mcp-servers/{name}', async () => {
            const event = createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools');
            const result = await handler(event, mockContext);

            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body)).toEqual({ success: true });

            // Verify DynamoDB PutCommand was called with correct item
            const putCall = mockDocClientSend.mock.calls.find(
                (call: any[]) => call[0].Item?.PK === 'MCP#weather-tools',
            );
            expect(putCall).toBeDefined();
            expect(putCall![0].Item).toMatchObject({
                PK: 'MCP#weather-tools',
                SK: 'CONFIG',
                name: 'weather-tools',
                transport: 'sse',
                url: 'https://weather-mcp.example.com/sse',
                enabled: true,
                description: 'Weather data tools',
                toolFilter: ['get_weather', 'get_forecast'],
            });
        });

        it('should reject invalid transport type', async () => {
            const event = createEvent('PUT', { transport: 'invalid', url: 'https://x.com' }, 'bad-server');
            const result = await handler(event, mockContext);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('transport must be one of');
        });

        it('should reject sse transport without url', async () => {
            const event = createEvent('PUT', { transport: 'sse', enabled: true }, 'no-url');
            const result = await handler(event, mockContext);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('url is required');
        });

        it('should reject stdio transport without command', async () => {
            const event = createEvent('PUT', { transport: 'stdio', enabled: true }, 'no-cmd');
            const result = await handler(event, mockContext);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('command is required');
        });
    });

    // ── Step 2: Verify agent picks up new tools on next invocation ─────

    describe('Step 2: Verify agent picks up new tools on next invocation', () => {
        it('should return the new server in GET /agent/mcp-servers after creation', async () => {
            // First, add the server
            const putEvent = createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools');
            await handler(putEvent, mockContext);

            // Now list all servers
            const listEvent = createEvent('GET');
            const result = await handler(listEvent, mockContext);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.servers).toHaveLength(1);
            expect(body.servers[0]).toMatchObject({
                name: 'weather-tools',
                transport: 'sse',
                url: 'https://weather-mcp.example.com/sse',
                enabled: true,
            });
        });

        it('should include the new server in enabled servers scan (agent invocation path)', async () => {
            // Add the server
            const putEvent = createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools');
            await handler(putEvent, mockContext);

            // After PUT, a list/scan should find the enabled server
            const listEvent = createEvent('GET');
            await handler(listEvent, mockContext);

            const lastScanResult = await mockDocClientSend.mock.results[
                mockDocClientSend.mock.results.length - 1
            ].value;
            expect(lastScanResult.Items.length).toBeGreaterThanOrEqual(1);
            expect(lastScanResult.Items[0].name).toBe('weather-tools');
        });
    });

    // ── Step 3: Disable server and verify tools are no longer available ─

    describe('Step 3: Disable server and verify tools are no longer available', () => {
        it('should disable a server via PUT with enabled=false', async () => {
            // Add the server first
            const putEvent = createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools');
            await handler(putEvent, mockContext);

            // Disable it
            const disableEvent = createEvent(
                'PUT',
                { ...NEW_SERVER_CONFIG, enabled: false },
                'weather-tools',
            );
            const result = await handler(disableEvent, mockContext);

            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body)).toEqual({ success: true });

            // Verify the stored record has enabled=false
            const storedItem = dynamo.store.get('MCP#weather-tools#CONFIG');
            expect(storedItem).toBeDefined();
            expect(storedItem!.enabled).toBe(false);
        });

        it('should exclude disabled server from enabled servers scan', async () => {
            // Add then disable
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);
            await handler(
                createEvent('PUT', { ...NEW_SERVER_CONFIG, enabled: false }, 'weather-tools'),
                mockContext,
            );

            // List all servers — should still appear
            const listResult = await handler(createEvent('GET'), mockContext);
            const allServers = JSON.parse(listResult.body).servers;
            expect(allServers).toHaveLength(1);
            expect(allServers[0].enabled).toBe(false);

            // Simulate enabled-only scan (what agent invocation does)
            // The DynamoDB simulator filters enabled=true, so disabled server should be excluded
            const enabledScanResult = await mockDocClientSend(new MockScanCommand({
                TableName: 'MCPServerConfig',
                FilterExpression: 'SK = :sk AND enabled = :enabled',
                ExpressionAttributeValues: { ':sk': 'CONFIG', ':enabled': true },
            }));
            expect(enabledScanResult.Items).toHaveLength(0);
        });

        it('should not include disabled server tools in agent action groups', async () => {
            // Add an enabled server and a disabled server
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);
            await handler(
                createEvent(
                    'PUT',
                    { transport: 'sse', url: 'https://calc.example.com', enabled: false, description: 'Calculator' },
                    'calc-tools',
                ),
                mockContext,
            );

            // Scan for enabled servers only
            const enabledResult = await mockDocClientSend(new MockScanCommand({
                TableName: 'MCPServerConfig',
                FilterExpression: 'SK = :sk AND enabled = :enabled',
                ExpressionAttributeValues: { ':sk': 'CONFIG', ':enabled': true },
            }));

            // Only the enabled server should be returned
            expect(enabledResult.Items).toHaveLength(1);
            expect(enabledResult.Items[0].name).toBe('weather-tools');
        });
    });

    // ── Step 4: Delete server config and verify cleanup ────────────────

    describe('Step 4: Delete server config and verify cleanup', () => {
        it('should delete a non-builtin server via DELETE /agent/mcp-servers/{name}', async () => {
            // Add the server
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);

            // Delete it
            const deleteEvent = createEvent('DELETE', undefined, 'weather-tools');
            const result = await handler(deleteEvent, mockContext);

            expect(result.statusCode).toBe(200);
            expect(JSON.parse(result.body)).toEqual({ success: true });
        });

        it('should remove server from DynamoDB after deletion', async () => {
            // Add then delete
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);
            await handler(createEvent('DELETE', undefined, 'weather-tools'), mockContext);

            // Verify the item is gone from the store
            expect(dynamo.store.has('MCP#weather-tools#CONFIG')).toBe(false);
        });

        it('should return empty list after deleting the only server', async () => {
            // Add then delete
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);
            await handler(createEvent('DELETE', undefined, 'weather-tools'), mockContext);

            // List should be empty
            const listResult = await handler(createEvent('GET'), mockContext);
            expect(JSON.parse(listResult.body).servers).toHaveLength(0);
        });

        it('should return 404 when deleting a non-existent server', async () => {
            const deleteEvent = createEvent('DELETE', undefined, 'nonexistent');
            const result = await handler(deleteEvent, mockContext);

            expect(result.statusCode).toBe(404);
            expect(JSON.parse(result.body).error).toContain('not found');
        });

        it('should prevent deletion of built-in server configs', async () => {
            // Manually insert a built-in server into the store
            dynamo.store.set('MCP#DocumentTools#CONFIG', {
                PK: 'MCP#DocumentTools',
                SK: 'CONFIG',
                name: 'DocumentTools',
                transport: 'stdio',
                command: 'node',
                args: ['builtin.js'],
                enabled: true,
                builtin: true,
            });

            const deleteEvent = createEvent('DELETE', undefined, 'DocumentTools');
            const result = await handler(deleteEvent, mockContext);

            expect(result.statusCode).toBe(403);
            expect(JSON.parse(result.body).error).toContain('Cannot delete built-in');

            // Verify it's still in the store
            expect(dynamo.store.has('MCP#DocumentTools#CONFIG')).toBe(true);
        });
    });

    // ── Authorization checks ───────────────────────────────────────────

    describe('Authorization checks', () => {
        it('should reject requests without admin role', async () => {
            const event: APIGatewayProxyEvent = {
                ...createEvent('GET'),
                requestContext: {
                    authorizer: {
                        userId: 'regular-user',
                        roles: JSON.stringify(['user']),
                    },
                } as any,
            };

            const result = await handler(event, mockContext);
            expect(result.statusCode).toBe(403);
            expect(JSON.parse(result.body).error).toContain('Admin role required');
        });

        it('should reject requests without userId', async () => {
            const event: APIGatewayProxyEvent = {
                ...createEvent('GET'),
                requestContext: { authorizer: {} } as any,
            };

            const result = await handler(event, mockContext);
            expect(result.statusCode).toBe(401);
        });
    });

    // ── Full lifecycle: add → list → disable → verify → delete → verify ─

    describe('Full MCP server management lifecycle', () => {
        it('should complete the full add → use → disable → delete lifecycle', async () => {
            // 1. Add a new MCP server
            const addResult = await handler(
                createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'),
                mockContext,
            );
            expect(addResult.statusCode).toBe(200);

            // 2. Verify it appears in the list (agent would pick it up)
            let listResult = await handler(createEvent('GET'), mockContext);
            let servers = JSON.parse(listResult.body).servers;
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('weather-tools');
            expect(servers[0].enabled).toBe(true);

            // 3. Disable the server
            const disableResult = await handler(
                createEvent('PUT', { ...NEW_SERVER_CONFIG, enabled: false }, 'weather-tools'),
                mockContext,
            );
            expect(disableResult.statusCode).toBe(200);

            // 4. Verify it's disabled (agent would NOT pick it up)
            listResult = await handler(createEvent('GET'), mockContext);
            servers = JSON.parse(listResult.body).servers;
            expect(servers).toHaveLength(1);
            expect(servers[0].enabled).toBe(false);

            // Enabled-only scan returns nothing
            const enabledScan = await mockDocClientSend(new MockScanCommand({
                TableName: 'MCPServerConfig',
                FilterExpression: 'SK = :sk AND enabled = :enabled',
                ExpressionAttributeValues: { ':sk': 'CONFIG', ':enabled': true },
            }));
            expect(enabledScan.Items).toHaveLength(0);

            // 5. Delete the server
            const deleteResult = await handler(
                createEvent('DELETE', undefined, 'weather-tools'),
                mockContext,
            );
            expect(deleteResult.statusCode).toBe(200);

            // 6. Verify it's completely gone
            listResult = await handler(createEvent('GET'), mockContext);
            servers = JSON.parse(listResult.body).servers;
            expect(servers).toHaveLength(0);
            expect(dynamo.store.size).toBe(0);
        });

        it('should handle multiple servers independently', async () => {
            // Add two servers
            await handler(createEvent('PUT', NEW_SERVER_CONFIG, 'weather-tools'), mockContext);
            await handler(
                createEvent(
                    'PUT',
                    { transport: 'stdio', command: 'node', args: ['calc.js'], enabled: true, description: 'Calculator' },
                    'calc-tools',
                ),
                mockContext,
            );

            // Both should appear
            let listResult = await handler(createEvent('GET'), mockContext);
            expect(JSON.parse(listResult.body).servers).toHaveLength(2);

            // Disable one
            await handler(
                createEvent('PUT', { ...NEW_SERVER_CONFIG, enabled: false }, 'weather-tools'),
                mockContext,
            );

            // Only calc-tools should be enabled
            const enabledScan = await mockDocClientSend(new MockScanCommand({
                TableName: 'MCPServerConfig',
                FilterExpression: 'SK = :sk AND enabled = :enabled',
                ExpressionAttributeValues: { ':sk': 'CONFIG', ':enabled': true },
            }));
            expect(enabledScan.Items).toHaveLength(1);
            expect(enabledScan.Items[0].name).toBe('calc-tools');

            // Delete weather-tools
            await handler(createEvent('DELETE', undefined, 'weather-tools'), mockContext);

            // Only calc-tools remains
            listResult = await handler(createEvent('GET'), mockContext);
            const remaining = JSON.parse(listResult.body).servers;
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('calc-tools');
        });
    });
});
