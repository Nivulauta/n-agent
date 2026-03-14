import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { handler } from './index.js';

// Mock DynamoDB client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Type guard for response object
function isResponseObject(response: APIGatewayProxyResultV2): response is { statusCode: number; body: string } {
    return typeof response === 'object' && 'statusCode' in response;
}

// Helper function to create WebSocket connect event
function createConnectEvent(connectionId: string, userId?: string): any {
    return {
        requestContext: {
            connectionId,
            routeKey: '$connect',
            eventType: 'CONNECT' as const,
            requestId: 'test-request-id',
            apiId: 'test-api-id',
            domainName: 'test-domain',
            stage: 'test',
            requestTimeEpoch: Date.now(),
            messageId: 'test-message-id',
            extendedRequestId: 'test-extended-request-id',
            requestTime: new Date().toISOString(),
            messageDirection: 'IN' as const,
            connectedAt: Date.now(),
            authorizer: userId ? {
                userId,
                username: 'testuser',
            } : undefined,
        },
        isBase64Encoded: false,
    };
}

beforeEach(() => {
    ddbMock.reset();
});

describe('WebSocket Connection Handler', () => {
    /**
     * **Validates: Requirements 2.3**
     * 
     * Property 5: WebSocket Connection Persistence
     * 
     * For any active chat session, the WebSocket_Manager should maintain an open connection
     * without unexpected disconnections during the session lifetime.
     * 
     * This property test verifies that:
     * 1. Connection records are successfully stored in DynamoDB for all valid connection attempts
     * 2. Connection metadata (connectionId, userId, timestamp, TTL) is correctly persisted
     * 3. The handler returns success status for all valid connections
     * 4. Connection records include appropriate TTL for session management
     */
    describe('Property 5: WebSocket Connection Persistence', () => {
        it('should successfully persist connection records for any valid connection attempt', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate various valid connection scenarios
                    fc.record({
                        connectionId: fc.hexaString({ minLength: 10, maxLength: 50 }),
                        userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                    }),
                    async (connectionData: { connectionId: string; userId: string }) => {
                        // Reset mock before each test
                        ddbMock.reset();

                        // Mock successful DynamoDB put operation
                        ddbMock.on(PutCommand).resolves({});

                        // Create WebSocket connect event
                        const event = createConnectEvent(connectionData.connectionId, connectionData.userId);

                        // Call handler
                        const response = await handler(event);

                        // Property assertions: Connection should be persisted successfully

                        // Ensure response is an object
                        expect(isResponseObject(response)).toBe(true);
                        if (!isResponseObject(response)) return;

                        // 1. Handler should return success status (200)
                        expect(response.statusCode).toBe(200);

                        // 2. Response should indicate successful connection
                        const body = JSON.parse(response.body);
                        expect(body).toHaveProperty('message');
                        expect(body.message).toBe('Connected');

                        // 3. DynamoDB PutCommand should have been called exactly once
                        expect(ddbMock.calls()).toHaveLength(1);

                        // 4. Verify the connection record structure
                        const putCall = ddbMock.commandCalls(PutCommand)[0];
                        expect(putCall?.args[0].input).toMatchObject({
                            TableName: 'test-connections-table',
                        });

                        const item = putCall?.args[0].input.Item;
                        if (!item) throw new Error('Item should be defined');

                        // 5. Connection record should have correct primary key structure
                        expect(item).toHaveProperty('PK');
                        expect(item).toHaveProperty('SK');
                        expect(item.PK).toBe(`CONNECTION#${connectionData.connectionId}`);
                        expect(item.SK).toBe(`CONNECTION#${connectionData.connectionId}`);

                        // 6. Connection record should include connectionId and userId
                        expect(item.connectionId).toBe(connectionData.connectionId);
                        expect(item.userId).toBe(connectionData.userId);

                        // 7. Connection record should have connectedAt timestamp
                        expect(item).toHaveProperty('connectedAt');
                        expect(typeof item.connectedAt).toBe('number');
                        expect(item.connectedAt).toBeGreaterThan(0);

                        // 8. Connection record should have TTL for automatic cleanup (10 minutes)
                        expect(item).toHaveProperty('ttl');
                        expect(typeof item.ttl).toBe('number');
                        expect(item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));

                        // TTL should be approximately 10 minutes (600 seconds) from now
                        const expectedTTL = Math.floor(Date.now() / 1000) + (10 * 60);
                        const ttlDifference = Math.abs((item.ttl as number) - expectedTTL);
                        expect(ttlDifference).toBeLessThan(5); // Allow 5 seconds tolerance
                    }
                ),
                {
                    numRuns: 100, // Run 100 test cases with different connection scenarios
                    verbose: true,
                }
            );
        });

        it('should maintain connection persistence across multiple concurrent connections', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate multiple concurrent connection attempts
                    fc.array(
                        fc.record({
                            connectionId: fc.hexaString({ minLength: 10, maxLength: 50 }),
                            userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (connections: Array<{ connectionId: string; userId: string }>) => {
                        // Reset mock before each test
                        ddbMock.reset();

                        // Mock successful DynamoDB operations for all connections
                        ddbMock.on(PutCommand).resolves({});

                        // Process all connections concurrently
                        const responses = await Promise.all(
                            connections.map(conn =>
                                handler(createConnectEvent(conn.connectionId, conn.userId))
                            )
                        );

                        // Property: All connections should be persisted successfully

                        // 1. All responses should have success status
                        responses.forEach(response => {
                            expect(isResponseObject(response)).toBe(true);
                            if (isResponseObject(response)) {
                                expect(response.statusCode).toBe(200);
                            }
                        });

                        // 2. Number of DynamoDB calls should match number of connections
                        expect(ddbMock.calls()).toHaveLength(connections.length);

                        // 3. Each connection should have a unique record
                        const connectionIds = new Set();
                        const putCalls = ddbMock.commandCalls(PutCommand);
                        putCalls.forEach(call => {
                            const item = call?.args[0].input.Item;
                            if (item) {
                                connectionIds.add(item.connectionId);
                            }
                        });
                        expect(connectionIds.size).toBe(connections.length);
                    }
                ),
                {
                    numRuns: 50,
                    verbose: true,
                }
            );
        });

        it('should persist connection with valid TTL for session timeout management', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        connectionId: fc.hexaString({ minLength: 10, maxLength: 50 }),
                        userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                    }),
                    async (connectionData: { connectionId: string; userId: string }) => {
                        // Reset mock before each test
                        ddbMock.reset();
                        ddbMock.on(PutCommand).resolves({});

                        const beforeTimestamp = Math.floor(Date.now() / 1000);
                        const event = createConnectEvent(connectionData.connectionId, connectionData.userId);
                        await handler(event);
                        const afterTimestamp = Math.floor(Date.now() / 1000);

                        const putCall = ddbMock.commandCalls(PutCommand)[0];
                        const item = putCall?.args[0].input.Item;
                        if (!item) throw new Error('Item should be defined');

                        // Property: TTL should be set to 10 minutes (600 seconds) from connection time
                        const expectedMinTTL = beforeTimestamp + (10 * 60);
                        const expectedMaxTTL = afterTimestamp + (10 * 60);

                        expect(item.ttl).toBeGreaterThanOrEqual(expectedMinTTL - 2); // Allow 2 seconds tolerance before
                        expect((item.ttl as number)).toBeLessThanOrEqual(expectedMaxTTL + 2); // Allow 2 seconds tolerance after
                    }
                ),
                {
                    numRuns: 50,
                    verbose: true,
                }
            );
        });

        // Specific edge case tests
        it('should successfully persist connection with minimum length connectionId', async () => {
            ddbMock.on(PutCommand).resolves({});

            const event = createConnectEvent('minConn123', 'user123');
            const response = await handler(event);

            expect(isResponseObject(response)).toBe(true);
            if (isResponseObject(response)) {
                expect(response.statusCode).toBe(200);
            }
            expect(ddbMock.calls()).toHaveLength(1);
        });

        it('should successfully persist connection with maximum length connectionId', async () => {
            ddbMock.on(PutCommand).resolves({});

            const longConnectionId = 'a'.repeat(50);
            const event = createConnectEvent(longConnectionId, 'user123');
            const response = await handler(event);

            expect(isResponseObject(response)).toBe(true);
            if (isResponseObject(response)) {
                expect(response.statusCode).toBe(200);
            }
            expect(ddbMock.calls()).toHaveLength(1);

            const putCall = ddbMock.commandCalls(PutCommand)[0];
            const item = putCall?.args[0].input.Item;
            if (item) {
                expect(item.connectionId).toBe(longConnectionId);
            }
        });

        it('should successfully persist connection with special characters in userId', async () => {
            ddbMock.on(PutCommand).resolves({});

            const specialUserId = 'user-123_test@example.com';
            const event = createConnectEvent('conn123', specialUserId);
            const response = await handler(event);

            expect(isResponseObject(response)).toBe(true);
            if (isResponseObject(response)) {
                expect(response.statusCode).toBe(200);
            }

            const putCall = ddbMock.commandCalls(PutCommand)[0];
            const item = putCall?.args[0].input.Item;
            if (item) {
                expect(item.userId).toBe(specialUserId);
            }
        });

        it('should reject connection without userId in authorizer context', async () => {
            ddbMock.on(PutCommand).resolves({});

            const event = createConnectEvent('conn123', undefined);
            const response = await handler(event);

            // Should return 401 Unauthorized
            expect(isResponseObject(response)).toBe(true);
            if (isResponseObject(response)) {
                expect(response.statusCode).toBe(401);

                const body = JSON.parse(response.body);
                expect(body.message).toBe('Unauthorized');
            }

            // Should NOT persist connection to DynamoDB
            expect(ddbMock.calls()).toHaveLength(0);
        });

        it('should handle DynamoDB errors gracefully', async () => {
            // Mock DynamoDB error
            ddbMock.on(PutCommand).rejects(new Error('DynamoDB service unavailable'));

            const event = createConnectEvent('conn123', 'user123');
            const response = await handler(event);

            // Should return 500 Internal Server Error
            expect(isResponseObject(response)).toBe(true);
            if (isResponseObject(response)) {
                expect(response.statusCode).toBe(500);

                const body = JSON.parse(response.body);
                expect(body.message).toBe('Internal server error');
            }
        });

        it('should persist connection with correct timestamp within reasonable time window', async () => {
            ddbMock.on(PutCommand).resolves({});

            const beforeTimestamp = Date.now();
            const event = createConnectEvent('conn123', 'user123');
            await handler(event);
            const afterTimestamp = Date.now();

            const putCall = ddbMock.commandCalls(PutCommand)[0];
            const item = putCall?.args[0].input.Item;
            if (!item) throw new Error('Item should be defined');

            // connectedAt should be between before and after timestamps
            expect(item.connectedAt).toBeGreaterThanOrEqual(beforeTimestamp);
            expect(item.connectedAt).toBeLessThanOrEqual(afterTimestamp);
        });

        it('should persist multiple connections for the same user', async () => {
            ddbMock.on(PutCommand).resolves({});

            const userId = 'user123';
            const conn1 = createConnectEvent('conn1', userId);
            const conn2 = createConnectEvent('conn2', userId);
            const conn3 = createConnectEvent('conn3', userId);

            const responses = await Promise.all([
                handler(conn1),
                handler(conn2),
                handler(conn3),
            ]);

            // All connections should succeed
            responses.forEach(response => {
                expect(isResponseObject(response)).toBe(true);
                if (isResponseObject(response)) {
                    expect(response.statusCode).toBe(200);
                }
            });

            // Should have 3 separate connection records
            expect(ddbMock.calls()).toHaveLength(3);

            // Each should have the same userId but different connectionIds
            const putCalls = ddbMock.commandCalls(PutCommand);
            putCalls.forEach((call, index) => {
                const item = call?.args[0].input.Item;
                if (item) {
                    expect(item.userId).toBe(userId);
                    expect(item.connectionId).toBe(`conn${index + 1}`);
                }
            });
        });
    });

    /**
     * **Validates: Requirements 2.4**
     * 
     * Property 6: WebSocket Reconnection
     * 
     * For any interrupted WebSocket connection, the WebSocket_Manager should attempt to
     * re-establish the connection within 3 seconds of detecting the interruption.
     * 
     * This property test verifies that:
     * 1. The handler successfully processes reconnection attempts after connection interruption
     * 2. New connection records are created for reconnection attempts
     * 3. Multiple rapid reconnection attempts are handled correctly
     * 4. Reconnection attempts with the same userId but different connectionId succeed
     * 5. The system maintains connection state consistency during reconnection
     * 
     * Note: This tests the backend's ability to handle reconnection attempts.
     * The actual reconnection logic (detecting interruption and initiating reconnection
     * within 3 seconds) is implemented in the frontend WebSocket client.
     */
    describe('Property 6: WebSocket Reconnection', () => {
        it('should successfully handle reconnection attempts for any interrupted connection', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate scenarios with initial connection and reconnection attempts
                    fc.record({
                        userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                        initialConnectionId: fc.hexaString({ minLength: 10, maxLength: 50 }),
                        reconnectionConnectionId: fc.hexaString({ minLength: 10, maxLength: 50 }),
                    }),
                    async (scenario: {
                        userId: string;
                        initialConnectionId: string;
                        reconnectionConnectionId: string;
                    }) => {
                        // Ensure connectionIds are different (simulating new connection after interruption)
                        fc.pre(scenario.initialConnectionId !== scenario.reconnectionConnectionId);

                        // Reset mock before each test
                        ddbMock.reset();
                        ddbMock.on(PutCommand).resolves({});

                        // 1. Establish initial connection
                        const initialEvent = createConnectEvent(
                            scenario.initialConnectionId,
                            scenario.userId
                        );
                        const initialResponse = await handler(initialEvent);

                        // Initial connection should succeed
                        expect(isResponseObject(initialResponse)).toBe(true);
                        if (!isResponseObject(initialResponse)) return;
                        expect(initialResponse.statusCode).toBe(200);

                        // 2. Attempt reconnection with new connectionId (same userId)
                        const reconnectionEvent = createConnectEvent(
                            scenario.reconnectionConnectionId,
                            scenario.userId
                        );
                        const reconnectionResponse = await handler(reconnectionEvent);

                        // Property assertions: Reconnection should be handled successfully

                        // 1. Reconnection should succeed with 200 status
                        expect(isResponseObject(reconnectionResponse)).toBe(true);
                        if (!isResponseObject(reconnectionResponse)) return;
                        expect(reconnectionResponse.statusCode).toBe(200);

                        // 2. Response should indicate successful connection
                        const body = JSON.parse(reconnectionResponse.body);
                        expect(body.message).toBe('Connected');

                        // 3. Both connections should have been persisted (2 DynamoDB calls)
                        expect(ddbMock.calls()).toHaveLength(2);

                        // 4. Verify reconnection record has correct structure
                        const reconnectionPutCall = ddbMock.commandCalls(PutCommand)[1];
                        expect(reconnectionPutCall?.args[0].input).toMatchObject({
                            TableName: 'test-connections-table',
                        });

                        const reconnectionItem = reconnectionPutCall?.args[0].input.Item;
                        if (!reconnectionItem) throw new Error('Reconnection item should be defined');

                        // 5. Reconnection should create new connection record with new connectionId
                        expect(reconnectionItem.connectionId).toBe(scenario.reconnectionConnectionId);
                        expect(reconnectionItem.PK).toBe(`CONNECTION#${scenario.reconnectionConnectionId}`);
                        expect(reconnectionItem.SK).toBe(`CONNECTION#${scenario.reconnectionConnectionId}`);

                        // 6. Reconnection should maintain same userId
                        expect(reconnectionItem.userId).toBe(scenario.userId);

                        // 7. Reconnection should have new timestamp
                        expect(reconnectionItem.connectedAt).toBeGreaterThan(0);

                        // 8. Reconnection should have new TTL
                        expect(reconnectionItem.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
                    }
                ),
                {
                    numRuns: 10, // Test 10 different reconnection scenarios
                }
            );
        });

        it('should handle multiple rapid reconnection attempts within 3-second window', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                        // Generate 2-5 reconnection attempts
                        reconnectionAttempts: fc.array(
                            fc.hexaString({ minLength: 10, maxLength: 50 }),
                            { minLength: 2, maxLength: 5 }
                        ),
                    }),
                    async (scenario: {
                        userId: string;
                        reconnectionAttempts: string[];
                    }) => {
                        // Ensure all connectionIds are unique
                        const uniqueConnectionIds = new Set(scenario.reconnectionAttempts);
                        fc.pre(uniqueConnectionIds.size === scenario.reconnectionAttempts.length);

                        // Reset mock before each test
                        ddbMock.reset();
                        ddbMock.on(PutCommand).resolves({});

                        // Simulate rapid reconnection attempts (all within 3 seconds)
                        const responses = await Promise.all(
                            scenario.reconnectionAttempts.map(connectionId =>
                                handler(createConnectEvent(connectionId, scenario.userId))
                            )
                        );

                        // Property: All reconnection attempts should succeed

                        // 1. All responses should have success status
                        responses.forEach(response => {
                            expect(isResponseObject(response)).toBe(true);
                            if (isResponseObject(response)) {
                                expect(response.statusCode).toBe(200);
                            }
                        });

                        // 2. Number of DynamoDB calls should match number of attempts
                        expect(ddbMock.calls()).toHaveLength(scenario.reconnectionAttempts.length);

                        // 3. Each reconnection should create a unique connection record
                        const putCalls = ddbMock.commandCalls(PutCommand);
                        const persistedConnectionIds = new Set();
                        putCalls.forEach(call => {
                            const item = call?.args[0].input.Item;
                            if (item) {
                                persistedConnectionIds.add(item.connectionId);
                                // All should have the same userId
                                expect(item.userId).toBe(scenario.userId);
                            }
                        });
                        expect(persistedConnectionIds.size).toBe(scenario.reconnectionAttempts.length);
                    }
                ),
                {
                    numRuns: 10,
                }
            );
        });

        it('should handle reconnection with different connection metadata', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        userId: fc.hexaString({ minLength: 5, maxLength: 100 }),
                        connectionId1: fc.hexaString({ minLength: 10, maxLength: 50 }),
                        connectionId2: fc.hexaString({ minLength: 10, maxLength: 50 }),
                    }),
                    async (scenario: {
                        userId: string;
                        connectionId1: string;
                        connectionId2: string;
                    }) => {
                        fc.pre(scenario.connectionId1 !== scenario.connectionId2);

                        ddbMock.reset();
                        ddbMock.on(PutCommand).resolves({});

                        // First connection
                        const timestamp1Before = Date.now();
                        await handler(createConnectEvent(scenario.connectionId1, scenario.userId));
                        const timestamp1After = Date.now();

                        // Small delay to ensure different timestamps
                        await new Promise(resolve => setTimeout(resolve, 10));

                        // Reconnection
                        const timestamp2Before = Date.now();
                        await handler(createConnectEvent(scenario.connectionId2, scenario.userId));
                        const timestamp2After = Date.now();

                        // Property: Reconnection should have distinct metadata from original connection

                        const putCalls = ddbMock.commandCalls(PutCommand);
                        expect(putCalls).toHaveLength(2);

                        const item1 = putCalls[0]?.args[0].input.Item;
                        const item2 = putCalls[1]?.args[0].input.Item;

                        if (!item1 || !item2) throw new Error('Items should be defined');

                        // 1. Different connectionIds
                        expect(item1.connectionId).not.toBe(item2.connectionId);
                        expect(item1.connectionId).toBe(scenario.connectionId1);
                        expect(item2.connectionId).toBe(scenario.connectionId2);

                        // 2. Same userId (reconnection maintains user identity)
                        expect(item1.userId).toBe(item2.userId);
                        expect(item1.userId).toBe(scenario.userId);

                        // 3. Different timestamps (reconnection happens after original)
                        expect(item1.connectedAt).toBeGreaterThanOrEqual(timestamp1Before);
                        expect(item1.connectedAt).toBeLessThanOrEqual(timestamp1After);
                        expect(item2.connectedAt).toBeGreaterThanOrEqual(timestamp2Before);
                        expect(item2.connectedAt).toBeLessThanOrEqual(timestamp2After);
                        expect(item2.connectedAt).toBeGreaterThanOrEqual(item1.connectedAt);

                        // 4. TTLs should be valid (each connection has its own expiration)
                        // Note: TTLs may be the same if connections happen within the same second
                        // since TTL is calculated as Math.floor(Date.now() / 1000) + (10 * 60)
                        expect(item1.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
                        expect(item2.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
                        expect(item2.ttl).toBeGreaterThanOrEqual(item1.ttl);
                    }
                ),
                {
                    numRuns: 10,
                }
            );
        });

        // Specific edge case tests for reconnection scenarios
        it('should handle immediate reconnection (0ms delay)', async () => {
            ddbMock.on(PutCommand).resolves({});

            const userId = 'user123';
            const conn1 = 'connection1';
            const conn2 = 'connection2';

            // Connect and immediately reconnect
            const response1 = await handler(createConnectEvent(conn1, userId));
            const response2 = await handler(createConnectEvent(conn2, userId));

            expect(isResponseObject(response1)).toBe(true);
            expect(isResponseObject(response2)).toBe(true);
            if (isResponseObject(response1) && isResponseObject(response2)) {
                expect(response1.statusCode).toBe(200);
                expect(response2.statusCode).toBe(200);
            }

            expect(ddbMock.calls()).toHaveLength(2);
        });

        it('should handle reconnection with same connectionId (idempotent reconnection)', async () => {
            ddbMock.on(PutCommand).resolves({});

            const userId = 'user123';
            const connectionId = 'connection1';

            // Connect twice with same connectionId (simulating retry)
            const response1 = await handler(createConnectEvent(connectionId, userId));
            const response2 = await handler(createConnectEvent(connectionId, userId));

            // Both should succeed (idempotent operation)
            expect(isResponseObject(response1)).toBe(true);
            expect(isResponseObject(response2)).toBe(true);
            if (isResponseObject(response1) && isResponseObject(response2)) {
                expect(response1.statusCode).toBe(200);
                expect(response2.statusCode).toBe(200);
            }

            // Both attempts should be persisted
            expect(ddbMock.calls()).toHaveLength(2);
        });

        it('should handle reconnection after DynamoDB error on initial connection', async () => {
            const userId = 'user123';
            const conn1 = 'connection1';
            const conn2 = 'connection2';

            // First connection fails due to DynamoDB error
            ddbMock.on(PutCommand).rejectsOnce(new Error('DynamoDB unavailable'));
            const response1 = await handler(createConnectEvent(conn1, userId));

            expect(isResponseObject(response1)).toBe(true);
            if (isResponseObject(response1)) {
                expect(response1.statusCode).toBe(500);
            }

            // Reconnection succeeds (DynamoDB recovered)
            ddbMock.on(PutCommand).resolves({});
            const response2 = await handler(createConnectEvent(conn2, userId));

            expect(isResponseObject(response2)).toBe(true);
            if (isResponseObject(response2)) {
                expect(response2.statusCode).toBe(200);
            }

            // Should have 2 attempts (1 failed, 1 succeeded)
            expect(ddbMock.calls()).toHaveLength(2);
        });

        it('should maintain connection state consistency across reconnections', async () => {
            ddbMock.on(PutCommand).resolves({});

            const userId = 'user123';
            const connections = ['conn1', 'conn2', 'conn3', 'conn4', 'conn5'];

            // Simulate multiple reconnections in sequence
            for (const connectionId of connections) {
                const response = await handler(createConnectEvent(connectionId, userId));

                expect(isResponseObject(response)).toBe(true);
                if (isResponseObject(response)) {
                    expect(response.statusCode).toBe(200);
                }
            }

            // All connections should be persisted
            expect(ddbMock.calls()).toHaveLength(connections.length);

            // Verify each connection has correct state
            const putCalls = ddbMock.commandCalls(PutCommand);
            putCalls.forEach((call, index) => {
                const item = call?.args[0].input.Item;
                if (item) {
                    expect(item.userId).toBe(userId);
                    expect(item.connectionId).toBe(connections[index]);
                    expect(item.connectedAt).toBeGreaterThan(0);
                    expect(item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
                }
            });
        });

        it('should handle concurrent reconnection attempts from multiple users', async () => {
            ddbMock.on(PutCommand).resolves({});

            const scenarios = [
                { userId: 'user1', oldConn: 'user1-conn1', newConn: 'user1-conn2' },
                { userId: 'user2', oldConn: 'user2-conn1', newConn: 'user2-conn2' },
                { userId: 'user3', oldConn: 'user3-conn1', newConn: 'user3-conn2' },
            ];

            // All users reconnect concurrently
            const responses = await Promise.all(
                scenarios.flatMap(s => [
                    handler(createConnectEvent(s.oldConn, s.userId)),
                    handler(createConnectEvent(s.newConn, s.userId)),
                ])
            );

            // All reconnections should succeed
            responses.forEach(response => {
                expect(isResponseObject(response)).toBe(true);
                if (isResponseObject(response)) {
                    expect(response.statusCode).toBe(200);
                }
            });

            // Should have 6 total connections (2 per user)
            expect(ddbMock.calls()).toHaveLength(6);
        });
    });
});
