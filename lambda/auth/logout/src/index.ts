import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { logUserAction } from '../../../shared/audit-logger/src/audit-logger.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'Sessions';

/**
 * Logout endpoint Lambda function
 * POST /auth/logout
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Logout request received', { requestId: context.awsRequestId });

    try {
        // Get session ID from authorizer context
        const sessionId = event.requestContext?.authorizer?.sessionId;
        const userId = event.requestContext?.authorizer?.userId;

        if (!sessionId) {
            return createResponse(400, { error: 'Session ID not found in request context' });
        }

        // Delete session from DynamoDB
        await docClient.send(
            new DeleteCommand({
                TableName: SESSIONS_TABLE,
                Key: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                },
            })
        );

        console.log('Logout successful', { sessionId });

        // Log logout action
        await logUserAction({
            eventType: 'logout',
            userId: userId || 'unknown',
            sessionId,
            timestamp: Date.now(),
            ipAddress: event.requestContext?.identity?.sourceIp || 'unknown',
            userAgent: event.requestContext?.identity?.userAgent || 'unknown',
            metadata: {
                success: true,
            },
        });

        return createResponse(200, {
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('Logout error', { error: error instanceof Error ? error.message : error });
        return createResponse(500, { error: 'Internal server error' });
    }
};

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
