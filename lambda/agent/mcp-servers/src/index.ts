import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { MCPToolRegistry } from '../../../shared/mcp-registry/src/registry.js';
import { MCPServerConfig } from '../../../shared/mcp-registry/src/types.js';

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const ADMIN_ROLE = 'admin';

const registry = new MCPToolRegistry();

/**
 * MCP Server management endpoint Lambda function
 * GET    /agent/mcp-servers         — list all server configs
 * PUT    /agent/mcp-servers/{name}  — create/update a server config
 * DELETE /agent/mcp-servers/{name}  — remove a server config
 *
 * Restricted to admin role via authorizer context.
 * Validates: Requirement 16.1
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('MCP servers request', { method: event.httpMethod, path: event.path, requestId: context.awsRequestId });

    try {
        // Verify admin role
        const authError = requireAdmin(event);
        if (authError) return authError;

        const method = event.httpMethod;
        const name = event.pathParameters?.name;

        if (method === 'GET' && !name) {
            return handleList();
        }
        if (method === 'PUT' && name) {
            return handleUpsert(name, event.body);
        }
        if (method === 'DELETE' && name) {
            return handleDelete(name);
        }

        return response(400, { error: 'Invalid request' });
    } catch (err) {
        console.error('MCP servers handler error', { error: err instanceof Error ? err.message : err });
        return response(500, { error: 'Internal server error' });
    }
};

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleList(): Promise<APIGatewayProxyResult> {
    const servers = await registry.listServers();
    return response(200, { servers });
}

async function handleUpsert(name: string, body: string | null): Promise<APIGatewayProxyResult> {
    if (!body) {
        return response(400, { error: 'Request body is required' });
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(body);
    } catch {
        return response(400, { error: 'Invalid JSON body' });
    }

    const validationError = validateConfig(name, parsed);
    if (validationError) {
        return response(400, { error: validationError });
    }

    const config: MCPServerConfig = {
        name,
        transport: parsed.transport as MCPServerConfig['transport'],
        enabled: parsed.enabled !== false,
        ...(parsed.command !== undefined && { command: parsed.command as string }),
        ...(parsed.args !== undefined && { args: parsed.args as string[] }),
        ...(parsed.url !== undefined && { url: parsed.url as string }),
        ...(parsed.env !== undefined && { env: parsed.env as Record<string, string> }),
        ...(parsed.toolFilter !== undefined && { toolFilter: parsed.toolFilter as string[] }),
        ...(parsed.description !== undefined && { description: parsed.description as string }),
    };

    await registry.upsertServer(config);
    return response(200, { success: true });
}

async function handleDelete(name: string): Promise<APIGatewayProxyResult> {
    // Prevent deletion of built-in servers
    const existing = await registry.getServer(name);
    if (!existing) {
        return response(404, { error: 'Server not found' });
    }
    if (existing.builtin) {
        return response(403, { error: 'Cannot delete built-in server configuration' });
    }

    await registry.deleteServer(name);
    return response(200, { success: true });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function requireAdmin(event: APIGatewayProxyEvent): APIGatewayProxyResult | null {
    const userId = event.requestContext?.authorizer?.userId;
    if (!userId) {
        return response(401, { error: 'Unauthorized' });
    }

    const rolesStr = event.requestContext?.authorizer?.roles;
    let roles: string[] = [];
    if (rolesStr) {
        try {
            roles = JSON.parse(rolesStr as string);
        } catch {
            roles = [];
        }
    }

    if (!roles.includes(ADMIN_ROLE)) {
        return response(403, { error: 'Admin role required' });
    }

    return null;
}

const VALID_TRANSPORTS = ['stdio', 'sse', 'streamable-http'] as const;

function validateConfig(name: string, body: Record<string, unknown>): string | null {
    if (!body.transport || !VALID_TRANSPORTS.includes(body.transport as any)) {
        return `transport must be one of: ${VALID_TRANSPORTS.join(', ')}`;
    }

    const transport = body.transport as string;

    if (transport === 'stdio' && !body.command) {
        return 'command is required for stdio transport';
    }
    if ((transport === 'sse' || transport === 'streamable-http') && !body.url) {
        return 'url is required for sse/streamable-http transport';
    }

    if (body.args !== undefined && !Array.isArray(body.args)) {
        return 'args must be an array of strings';
    }
    if (body.toolFilter !== undefined && !Array.isArray(body.toolFilter)) {
        return 'toolFilter must be an array of strings';
    }

    return null;
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': CORS_ORIGIN,
            'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify(body),
    };
}
