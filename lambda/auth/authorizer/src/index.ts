import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, APIGatewayRequestAuthorizerEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'Sessions';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for authorization decisions
interface CacheEntry {
    policy: APIGatewayAuthorizerResult;
    expiresAt: number;
}

const authCache = new Map<string, CacheEntry>();

interface SessionToken {
    userId: string;
    username: string;
    roles: string[];
    sessionId: string;
    iat: number;
    exp: number;
}

interface SessionRecord {
    PK: string;
    SK: string;
    userId: string;
    username: string;
    roles: string[];
    createdAt: number;
    lastAccessedAt: number;
    expiresAt: number;
    ipAddress: string;
}

/**
 * Lambda Authorizer function for API Gateway
 * Supports both TOKEN (REST API) and REQUEST (WebSocket) authorizer types
 * Validates JWT tokens and checks session validity in DynamoDB
 */
export const handler = async (
    event: APIGatewayTokenAuthorizerEvent | APIGatewayRequestAuthorizerEvent,
    context: Context
): Promise<APIGatewayAuthorizerResult> => {
    console.log('Authorizer invoked', { requestId: context.awsRequestId, event: JSON.stringify(event) });

    try {
        let token: string | undefined;

        // Handle different authorizer types
        if ('authorizationToken' in event) {
            // TOKEN authorizer (REST API)
            token = event.authorizationToken;
        } else if ('queryStringParameters' in event && event.queryStringParameters) {
            // REQUEST authorizer (WebSocket API)
            token = event.queryStringParameters.token;
        }

        if (!token) {
            throw new Error('No authorization token provided');
        }

        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace(/^Bearer\s+/i, '');

        // Check cache first (disabled during development to avoid stale policies)
        // const cachedEntry = authCache.get(cleanToken);
        // if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        //     console.log('Returning cached authorization decision');
        //     return cachedEntry.policy;
        // }

        // Verify JWT token
        const decoded = jwt.verify(cleanToken, JWT_SECRET) as SessionToken;

        // Check if token is expired (24 hours)
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
            console.log('Token expired', { exp: decoded.exp, now });
            throw new Error('Token expired');
        }

        // Validate session in DynamoDB
        const sessionId = decoded.sessionId;
        const session = await getSession(sessionId);

        if (!session) {
            console.log('Session not found in DynamoDB', { sessionId });
            throw new Error('Invalid session');
        }

        // Check if session is expired
        if (session.expiresAt < Date.now()) {
            console.log('Session expired in DynamoDB', { expiresAt: session.expiresAt });
            throw new Error('Session expired');
        }

        // Generate IAM policy
        // For REST API, allow all methods under the API (not just the specific endpoint)
        // For WebSocket API, allow all routes
        let resourceArn: string;
        if ('methodArn' in event) {
            // TOKEN authorizer (REST API)
            // Replace the specific method/path with wildcard to allow all endpoints
            // Example: arn:aws:execute-api:region:account:api-id/stage/POST/documents/upload
            // Becomes: arn:aws:execute-api:region:account:api-id/stage/*/*
            resourceArn = event.methodArn.replace(/\/[A-Z]+\/.*$/, '/*/*');
        } else {
            // REQUEST authorizer (WebSocket API)
            const requestEvent = event as APIGatewayRequestAuthorizerEvent;
            resourceArn = requestEvent.methodArn || '*';
            // Replace $connect with wildcard to allow all routes
            resourceArn = resourceArn.replace(/\/\$connect$/, '/*');
        }

        const policy = generatePolicy(decoded.userId, 'Allow', resourceArn, {
            userId: decoded.userId,
            username: decoded.username,
            roles: JSON.stringify(decoded.roles),
            sessionId: decoded.sessionId,
        });

        // Cache the authorization decision (disabled during development)
        // authCache.set(cleanToken, {
        //     policy,
        //     expiresAt: Date.now() + CACHE_TTL_MS,
        // });

        // Clean up expired cache entries periodically
        // cleanupCache();

        console.log('Authorization successful', { userId: decoded.userId });
        return policy;
    } catch (error) {
        console.error('Authorization failed', { error: error instanceof Error ? error.message : error });
        // Return deny policy
        let resourceArn: string;
        if ('methodArn' in event) {
            resourceArn = event.methodArn;
        } else {
            const requestEvent = event as APIGatewayRequestAuthorizerEvent;
            resourceArn = requestEvent.methodArn || '*';
        }
        return generatePolicy('user', 'Deny', resourceArn);
    }
};

/**
 * Get session from DynamoDB
 */
async function getSession(sessionId: string): Promise<SessionRecord | null> {
    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: SESSIONS_TABLE,
                Key: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                },
            })
        );

        return result.Item as SessionRecord | null;
    } catch (error) {
        console.error('Error fetching session from DynamoDB', { error, sessionId });
        return null;
    }
}

/**
 * Generate IAM policy document for API Gateway
 */
function generatePolicy(
    principalId: string,
    effect: 'Allow' | 'Deny',
    resource: string,
    context?: Record<string, string>
): APIGatewayAuthorizerResult {
    const policy: APIGatewayAuthorizerResult = {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                },
            ],
        },
    };

    if (context && effect === 'Allow') {
        policy.context = context;
    }

    return policy;
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of authCache.entries()) {
        if (entry.expiresAt < now) {
            authCache.delete(key);
        }
    }
}
