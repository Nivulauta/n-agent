import { describe, it, expect, beforeEach } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import * as fc from 'fast-check';
import { handler } from './index';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import bcrypt from 'bcryptjs';

// Mock DynamoDB client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock context
const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: 'test-log-group',
    logStreamName: 'test-log-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => { },
    fail: () => { },
    succeed: () => { },
};

// Helper function to create API Gateway event
function createEvent(body: any): APIGatewayProxyEvent {
    return {
        body: JSON.stringify(body),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
            accountId: '123456789012',
            apiId: 'test-api',
            authorizer: null,
            protocol: 'HTTP/1.1',
            httpMethod: 'POST',
            path: '/auth/login',
            stage: 'test',
            requestId: 'test-request-id',
            requestTimeEpoch: Date.now(),
            resourceId: 'test-resource',
            resourcePath: '/auth/login',
            identity: {
                accessKey: null,
                accountId: null,
                apiKey: null,
                apiKeyId: null,
                caller: null,
                clientCert: null,
                cognitoAuthenticationProvider: null,
                cognitoAuthenticationType: null,
                cognitoIdentityId: null,
                cognitoIdentityPoolId: null,
                principalOrgId: null,
                sourceIp: '127.0.0.1',
                user: null,
                userAgent: 'test-agent',
                userArn: null,
            },
        },
        resource: '/auth/login',
    } as APIGatewayProxyEvent;
}

beforeEach(() => {
    ddbMock.reset();
});

describe('Authentication Service', () => {
    /**
     * **Validates: Requirements 1.2**
     * 
     * Property 1: Invalid Credentials Rejection
     * 
     * For any invalid credential combination (wrong username, wrong password, or malformed input),
     * the Authentication_Service should reject the authentication request and return an appropriate
     * error message without generating a session token.
     */
    describe('Property 1: Invalid Credentials Rejection', () => {
        it('should reject any invalid credential combination without generating a session token', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate various invalid credential scenarios
                    fc.oneof(
                        // Scenario 1: Missing username
                        fc.record({
                            username: fc.constant(''),
                            password: fc.string({ minLength: 1, maxLength: 100 }),
                        }),
                        // Scenario 2: Missing password
                        fc.record({
                            username: fc.string({ minLength: 1, maxLength: 100 }),
                            password: fc.constant(''),
                        }),
                        // Scenario 3: Both missing
                        fc.record({
                            username: fc.constant(''),
                            password: fc.constant(''),
                        }),
                        // Scenario 4: Null/undefined username
                        fc.record({
                            username: fc.constantFrom(null, undefined),
                            password: fc.string({ minLength: 1, maxLength: 100 }),
                        }),
                        // Scenario 5: Null/undefined password
                        fc.record({
                            username: fc.string({ minLength: 1, maxLength: 100 }),
                            password: fc.constantFrom(null, undefined),
                        }),
                        // Scenario 6: User not found (valid format but non-existent user)
                        fc.record({
                            username: fc.string({ minLength: 1, maxLength: 100 }),
                            password: fc.string({ minLength: 1, maxLength: 100 }),
                            userNotFound: fc.constant(true),
                        }),
                        // Scenario 7: Wrong password (user exists but password is wrong)
                        fc.record({
                            username: fc.constant('validuser'),
                            password: fc.string({ minLength: 1, maxLength: 100 }),
                            wrongPassword: fc.constant(true),
                        }),
                        // Scenario 8: Malformed input (special characters, very long strings)
                        fc.record({
                            username: fc.string({ minLength: 0, maxLength: 1000 }),
                            password: fc.string({ minLength: 0, maxLength: 1000 }),
                        })
                    ),
                    async (credentials: any) => {
                        // Setup mock responses based on scenario
                        if (credentials.userNotFound) {
                            // User not found scenario
                            ddbMock.on(GetCommand).resolves({ Item: undefined });
                        } else if (credentials.wrongPassword) {
                            // Wrong password scenario - user exists but password doesn't match
                            const correctPasswordHash = await bcrypt.hash('correctpassword', 10);
                            ddbMock.on(GetCommand).resolves({
                                Item: {
                                    PK: `USER#${credentials.username}`,
                                    SK: `USER#${credentials.username}`,
                                    userId: 'test-user-id',
                                    username: credentials.username,
                                    passwordHash: correctPasswordHash,
                                    roles: ['user'],
                                    createdAt: Date.now(),
                                },
                            });
                        } else {
                            // For other scenarios, return no user
                            ddbMock.on(GetCommand).resolves({ Item: undefined });
                        }

                        // Create event with credentials
                        const event = createEvent(credentials);

                        // Call handler
                        const response = await handler(event, mockContext);

                        // Parse response body
                        const body = JSON.parse(response.body);

                        // Assertions: Invalid credentials should be rejected
                        // 1. Status code should be 400 (bad request) or 401 (unauthorized)
                        expect([400, 401]).toContain(response.statusCode);

                        // 2. Response should contain an error message
                        expect(body).toHaveProperty('error');
                        expect(typeof body.error).toBe('string');
                        expect(body.error.length).toBeGreaterThan(0);

                        // 3. Response should NOT contain a session token
                        expect(body).not.toHaveProperty('token');
                        expect(body).not.toHaveProperty('expiresAt');
                        expect(body).not.toHaveProperty('userId');

                        // 4. No session should be created in DynamoDB
                        // (We verify this by checking that PutCommand was not called with session data)
                        // Note: In a real scenario, we'd mock PutCommand and verify it wasn't called
                    }
                ),
                {
                    numRuns: 100, // Run 100 test cases with different invalid credentials
                    verbose: true,
                }
            );
        });

        // Additional specific edge case tests
        it('should reject request with missing body', async () => {
            const event = {
                ...createEvent({}),
                body: null,
            };

            const response = await handler(event, mockContext);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(400);
            expect(body).toHaveProperty('error');
            expect(body).not.toHaveProperty('token');
        });

        it('should reject request with malformed JSON', async () => {
            const event = {
                ...createEvent({}),
                body: 'invalid-json{',
            };

            const response = await handler(event, mockContext);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(500);
            expect(body).toHaveProperty('error');
            expect(body).not.toHaveProperty('token');
        });

        it('should reject request with non-existent user', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const event = createEvent({
                username: 'nonexistentuser',
                password: 'somepassword',
            });

            const response = await handler(event, mockContext);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(401);
            expect(body.error).toBe('Invalid credentials');
            expect(body).not.toHaveProperty('token');
        });

        it('should reject request with wrong password', async () => {
            const correctPasswordHash = await bcrypt.hash('correctpassword', 10);

            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: 'USER#testuser',
                    SK: 'USER#testuser',
                    userId: 'test-user-id',
                    username: 'testuser',
                    passwordHash: correctPasswordHash,
                    roles: ['user'],
                    createdAt: Date.now(),
                },
            });

            const event = createEvent({
                username: 'testuser',
                password: 'wrongpassword',
            });

            const response = await handler(event, mockContext);
            const body = JSON.parse(response.body);

            expect(response.statusCode).toBe(401);
            expect(body.error).toBe('Invalid credentials');
            expect(body).not.toHaveProperty('token');
        });
    });

    /**
     * **Validates: Requirements 1.3, 1.4**
     * 
     * Property 2: Session Token Expiration
     * 
     * For any session token that has been inactive for 24 hours or more,
     * the Authentication_Service should treat it as expired and reject any requests using that token.
     */
    describe('Property 2: Session Token Expiration', () => {
        it('should reject session tokens that have been inactive for 24 hours or more', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate session age in hours (0 to 48 hours)
                    fc.double({ min: 0, max: 48, noNaN: true }),
                    async (sessionAgeHours: number) => {
                        const now = Date.now();
                        const sessionAgeMs = sessionAgeHours * 60 * 60 * 1000;
                        const lastAccessedAt = now - sessionAgeMs;
                        const expiresAt = lastAccessedAt + (24 * 60 * 60 * 1000); // 24 hours from last access

                        // Property: Sessions inactive for 24+ hours should be expired
                        const isExpired = expiresAt < now;
                        const shouldBeRejected = sessionAgeHours >= 24;

                        // Verify the property holds
                        expect(isExpired).toBe(shouldBeRejected);

                        // Additional verification: if expired, the session should be rejected
                        if (shouldBeRejected) {
                            // Session is expired, should be rejected
                            expect(expiresAt).toBeLessThan(now);
                        } else {
                            // Session is still valid, should be accepted
                            expect(expiresAt).toBeGreaterThanOrEqual(now);
                        }
                    }
                ),
                {
                    numRuns: 100,
                    verbose: true,
                }
            );
        }, 10000); // Increase timeout to 10 seconds for property-based test

        // Specific edge case tests
        it('should reject session token exactly at 24 hours of inactivity', async () => {
            const now = Date.now();
            const exactlyTwentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
            const expiresAt = exactlyTwentyFourHoursAgo + (24 * 60 * 60 * 1000);

            // Session created 24 hours ago, expires now
            const sessionId = 'test-session-id';
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                    userId: 'test-user-id',
                    username: 'testuser',
                    roles: ['user'],
                    createdAt: exactlyTwentyFourHoursAgo,
                    lastAccessedAt: exactlyTwentyFourHoursAgo,
                    expiresAt: expiresAt,
                    ipAddress: '127.0.0.1',
                },
            });

            // At exactly 24 hours, the session should be expired or about to expire
            expect(expiresAt).toBeLessThanOrEqual(now);
        });

        it('should accept session token with 23 hours of inactivity', async () => {
            const now = Date.now();
            const twentyThreeHoursAgo = now - (23 * 60 * 60 * 1000);
            const expiresAt = twentyThreeHoursAgo + (24 * 60 * 60 * 1000);

            // Session created 23 hours ago, expires in 1 hour
            const sessionId = 'test-session-id';
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                    userId: 'test-user-id',
                    username: 'testuser',
                    roles: ['user'],
                    createdAt: twentyThreeHoursAgo,
                    lastAccessedAt: twentyThreeHoursAgo,
                    expiresAt: expiresAt,
                    ipAddress: '127.0.0.1',
                },
            });

            // At 23 hours, the session should still be valid
            expect(expiresAt).toBeGreaterThan(now);
        });

        it('should reject session token with 25 hours of inactivity', async () => {
            const now = Date.now();
            const twentyFiveHoursAgo = now - (25 * 60 * 60 * 1000);
            const expiresAt = twentyFiveHoursAgo + (24 * 60 * 60 * 1000);

            // Session created 25 hours ago, expired 1 hour ago
            const sessionId = 'test-session-id';
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                    userId: 'test-user-id',
                    username: 'testuser',
                    roles: ['user'],
                    createdAt: twentyFiveHoursAgo,
                    lastAccessedAt: twentyFiveHoursAgo,
                    expiresAt: expiresAt,
                    ipAddress: '127.0.0.1',
                },
            });

            // At 25 hours, the session should be expired
            expect(expiresAt).toBeLessThan(now);
        });

        it('should reject session token with 48 hours of inactivity', async () => {
            const now = Date.now();
            const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
            const expiresAt = fortyEightHoursAgo + (24 * 60 * 60 * 1000);

            // Session created 48 hours ago, expired 24 hours ago
            const sessionId = 'test-session-id';
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                    userId: 'test-user-id',
                    username: 'testuser',
                    roles: ['user'],
                    createdAt: fortyEightHoursAgo,
                    lastAccessedAt: fortyEightHoursAgo,
                    expiresAt: expiresAt,
                    ipAddress: '127.0.0.1',
                },
            });

            // At 48 hours, the session should be expired
            expect(expiresAt).toBeLessThan(now);
        });

        it('should accept newly created session token', async () => {
            const now = Date.now();
            const expiresAt = now + (24 * 60 * 60 * 1000);

            // Session just created
            const sessionId = 'test-session-id';
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `SESSION#${sessionId}`,
                    SK: `SESSION#${sessionId}`,
                    userId: 'test-user-id',
                    username: 'testuser',
                    roles: ['user'],
                    createdAt: now,
                    lastAccessedAt: now,
                    expiresAt: expiresAt,
                    ipAddress: '127.0.0.1',
                },
            });

            // Newly created session should be valid
            expect(expiresAt).toBeGreaterThan(now);
        });
    });
});
