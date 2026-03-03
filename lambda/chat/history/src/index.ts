import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ChatHistoryStore } from '../../../shared/chat-history/src/chat-history.js';
import type { ChatMessage } from '../../../shared/chat-history/src/types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Initialize chat history store
let chatHistoryStore: ChatHistoryStore;

function getChatHistoryStore(): ChatHistoryStore {
    if (!chatHistoryStore) {
        chatHistoryStore = new ChatHistoryStore();
    }
    return chatHistoryStore;
}

interface ChatHistoryResponse {
    messages: ChatMessage[];
    nextToken?: string;
}

/**
 * Chat history endpoint Lambda function
 * GET /chat/history
 * 
 * Query Parameters:
 * - sessionId: string (required) - Session identifier
 * - limit: number (optional) - Maximum number of messages to retrieve (default: 50, max: 100)
 * - nextToken: string (optional) - Pagination token from previous request
 * 
 * Validates Requirements: 8.3
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Chat history request received', { requestId: context.awsRequestId });

    try {
        // Extract userId from authorizer context
        const userId = event.requestContext?.authorizer?.userId || 'unknown';

        if (userId === 'unknown') {
            return createResponse(401, { error: 'Unauthorized' });
        }

        // Parse query parameters
        const sessionId = event.queryStringParameters?.sessionId;
        if (!sessionId) {
            return createResponse(400, { error: 'Missing required parameter: sessionId' });
        }

        const limit = parseLimit(event.queryStringParameters?.limit);
        const nextToken = event.queryStringParameters?.nextToken;

        // Retrieve chat history
        const store = getChatHistoryStore();
        const result = await store.getHistory(userId, sessionId, limit, nextToken);

        console.log('Chat history retrieved successfully', {
            userId,
            sessionId,
            count: result.messages.length,
            hasMore: !!result.nextToken
        });

        const response: ChatHistoryResponse = {
            messages: result.messages,
            nextToken: result.nextToken
        };

        return createResponse(200, response);
    } catch (error) {
        console.error('Chat history handler error', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
        });

        // Return appropriate error response
        if (error instanceof Error && error.message.includes('KMS')) {
            return createResponse(500, { error: 'Encryption service error' });
        }

        return createResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Parse and validate limit parameter
 */
function parseLimit(limitParam?: string): number {
    if (!limitParam) {
        return DEFAULT_LIMIT;
    }

    const limit = parseInt(limitParam, 10);

    if (isNaN(limit) || limit <= 0) {
        return DEFAULT_LIMIT;
    }

    return Math.min(limit, MAX_LIMIT);
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(body),
    };
}
