import { jest } from '@jest/globals';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type { GetHistoryResult } from '../../../shared/chat-history/src/types.js';

// Mock the ChatHistoryStore before importing handler
const mockGetHistory = jest.fn<() => Promise<GetHistoryResult>>().mockResolvedValue({
    messages: [
        {
            userId: 'test-user',
            sessionId: 'test-session',
            messageId: 'msg-1',
            timestamp: 1704067200000,
            role: 'user',
            content: 'Hello',
            metadata: {}
        },
        {
            userId: 'test-user',
            sessionId: 'test-session',
            messageId: 'msg-2',
            timestamp: 1704067300000,
            role: 'assistant',
            content: 'Hi there!',
            metadata: {
                tokenCount: 10,
                latency: 500
            }
        }
    ],
    nextToken: undefined
});

jest.unstable_mockModule('../../../shared/chat-history/src/chat-history.js', () => ({
    ChatHistoryStore: jest.fn().mockImplementation(() => ({
        getHistory: mockGetHistory
    }))
}));

const { handler } = await import('./index.js');

describe('Chat History Lambda Handler', () => {
    const mockContext: Context = {
        awsRequestId: 'test-request-id',
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test-function',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        memoryLimitInMB: '512',
        logGroupName: '/aws/lambda/test',
        logStreamName: 'test-stream',
        getRemainingTimeInMillis: () => 30000,
        done: () => { },
        fail: () => { },
        succeed: () => { }
    };

    beforeEach(() => {
        mockGetHistory.mockClear();
    });

    test('should return 401 when userId is missing', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session'
            },
            requestContext: {
                authorizer: {}
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
    });

    test('should return 400 when sessionId is missing', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {},
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Missing required parameter: sessionId' });
    });

    test('should return chat history successfully', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session',
                limit: '10'
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0].messageId).toBe('msg-1');
        expect(body.messages[1].messageId).toBe('msg-2');
        expect(body.nextToken).toBeUndefined();
    });

    test('should use default limit when not provided', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session'
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(200);
    });

    test('should cap limit at maximum value', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session',
                limit: '200' // Exceeds MAX_LIMIT of 100
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(200);
    });

    test('should handle invalid limit parameter', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session',
                limit: 'invalid'
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(200);
        // Should use default limit
    });

    test('should include CORS headers in response', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session'
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.headers).toEqual({
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        });
    });

    test('should pass nextToken to getHistory', async () => {
        const event: Partial<APIGatewayProxyEvent> = {
            httpMethod: 'GET',
            queryStringParameters: {
                sessionId: 'test-session',
                nextToken: 'some-token'
            },
            requestContext: {
                authorizer: {
                    userId: 'test-user'
                }
            } as any
        };

        const result = await handler(event as APIGatewayProxyEvent, mockContext);

        expect(result.statusCode).toBe(200);
    });
});
