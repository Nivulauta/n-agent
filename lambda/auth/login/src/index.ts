import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logUserAction } from '../../../shared/audit-logger/src/audit-logger.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'Sessions';
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SESSION_DURATION_HOURS = 24;

interface LoginRequest {
    username: string;
    password: string;
}

interface UserRecord {
    PK: string;
    SK: string;
    userId: string;
    username: string;
    passwordHash: string;
    roles: string[];
    createdAt: number;
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

interface LoginResponse {
    token: string;
    expiresAt: number;
    userId: string;
}

/**
 * Login endpoint Lambda function
 * POST /auth/login
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Login request received', { requestId: context.awsRequestId });

    try {
        // Parse request body
        if (!event.body) {
            return createResponse(400, { error: 'Request body is required' });
        }

        const request: LoginRequest = JSON.parse(event.body);

        // Validate input
        if (!request.username || !request.password) {
            return createResponse(400, { error: 'Username and password are required' });
        }

        // Get user from DynamoDB
        const user = await getUser(request.username);

        if (!user) {
            console.log('User not found', { username: request.username });

            // Log failed login attempt (user not found)
            await logUserAction({
                eventType: 'login',
                userId: 'unknown',
                sessionId: 'failed',
                timestamp: Date.now(),
                ipAddress: event.requestContext?.identity?.sourceIp || 'unknown',
                userAgent: event.requestContext?.identity?.userAgent || 'unknown',
                metadata: {
                    success: false,
                    reason: 'user_not_found',
                    username: request.username,
                },
            });

            return createResponse(401, { error: 'Invalid credentials' });
        }

        // Verify password
        const passwordValid = await bcrypt.compare(request.password, user.passwordHash);

        if (!passwordValid) {
            console.log('Invalid password', { username: request.username });

            // Log failed login attempt
            await logUserAction({
                eventType: 'login',
                userId: user.userId,
                sessionId: 'failed',
                timestamp: Date.now(),
                ipAddress: event.requestContext?.identity?.sourceIp || 'unknown',
                userAgent: event.requestContext?.identity?.userAgent || 'unknown',
                metadata: {
                    success: false,
                    reason: 'invalid_password',
                    username: request.username,
                },
            });

            return createResponse(401, { error: 'Invalid credentials' });
        }

        // Generate session ID
        const sessionId = uuidv4();
        const now = Date.now();
        const expiresAt = now + SESSION_DURATION_HOURS * 60 * 60 * 1000;

        // Get client IP address
        const ipAddress = event.requestContext?.identity?.sourceIp || 'unknown';

        // Create session in DynamoDB
        const session: SessionRecord = {
            PK: `SESSION#${sessionId}`,
            SK: `SESSION#${sessionId}`,
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            createdAt: now,
            lastAccessedAt: now,
            expiresAt,
            ipAddress,
        };

        await docClient.send(
            new PutCommand({
                TableName: SESSIONS_TABLE,
                Item: session,
            })
        );

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.userId,
                username: user.username,
                roles: user.roles,
                sessionId,
            },
            JWT_SECRET,
            {
                expiresIn: `${SESSION_DURATION_HOURS}h`,
            }
        );

        const response: LoginResponse = {
            token,
            expiresAt,
            userId: user.userId,
        };

        console.log('Login successful', { userId: user.userId, sessionId });

        // Log successful login
        await logUserAction({
            eventType: 'login',
            userId: user.userId,
            sessionId,
            timestamp: now,
            ipAddress,
            userAgent: event.requestContext?.identity?.userAgent || 'unknown',
            metadata: {
                success: true,
                username: user.username,
                roles: user.roles,
            },
        });

        return createResponse(200, response);
    } catch (error) {
        console.error('Login error', { error: error instanceof Error ? error.message : error });
        return createResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Get user from DynamoDB
 */
async function getUser(username: string): Promise<UserRecord | null> {
    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: {
                    PK: `USER#${username}`,
                    SK: `USER#${username}`,
                },
            })
        );

        return result.Item as UserRecord | null;
    } catch (error) {
        console.error('Error fetching user from DynamoDB', { error, username });
        return null;
    }
}

/**
 * Get CORS origin based on environment
 */
function getCorsOrigin(): string {
    // In production, this should be set via environment variable
    // For now, allow localhost for development
    return process.env.CORS_ORIGIN || 'http://localhost:5173';
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCorsOrigin(),
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify(body),
    };
}
