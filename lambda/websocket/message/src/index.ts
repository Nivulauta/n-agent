import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { RateLimiter } from '../../../shared/rate-limiter/src/rate-limiter.js';
import { logUserAction, logAPICall } from '../../../shared/audit-logger/src/audit-logger.js';
import { UserContext } from '../../../shared/rate-limiter/src/types.js';
import { MessageSender } from '../../shared/src/message-sender.js';
import { ChatHistoryStore } from '../../../shared/chat-history/src/chat-history.js';
import { classifyQuery } from '../../../shared/query-router/src/classifier.js';
import { RAGSystem } from '../../../shared/rag/src/rag.js';
import { CacheLayer } from '../../../shared/cache/src/cache.js';
import { BedrockService } from '../../../shared/bedrock/src/bedrock.js';
import { CircuitBreaker, CircuitBreakerError } from '../../../shared/circuit-breaker/src/circuit-breaker.js';
import { emitExecutionDuration, emitQueryLatency, emitTokenUsage, flushMetrics } from '../../../shared/metrics/dist/index.mjs';
import { InlineAgentService } from '../../../shared/inline-agent/src/inline-agent.js';
import { buildAgentInstruction } from '../../../shared/inline-agent/src/instruction-builder.js';
import { createBuiltinToolExecutor, BUILTIN_ACTION_GROUP } from '../../../shared/inline-agent/src/builtin-tools.js';
import type { ActionGroupConfig, AgentResponseChunk, ToolExecutionResult } from '../../../shared/inline-agent/src/types.js';
import { MCPToolRegistry } from '../../../shared/mcp-registry/src/registry.js';
import { MCPClientBridge } from '../../../shared/mcp-bridge/src/bridge.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || '';
const CHAT_HISTORY_TABLE = process.env.CHAT_HISTORY_TABLE || '';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const CACHE_HOST = process.env.CACHE_HOST || '';
const CACHE_PORT = parseInt(process.env.CACHE_PORT || '6379', 10);
const DOCUMENT_METADATA_TABLE = process.env.DOCUMENT_METADATA_TABLE || 'DocumentMetadata';
const MCP_SERVER_CONFIG_TABLE = process.env.MCP_SERVER_CONFIG_TABLE || '';
const AGENT_FOUNDATION_MODEL = process.env.AGENT_FOUNDATION_MODEL || 'anthropic.claude-haiku-4-5';
const AGENT_MAX_ITERATIONS = parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10);
// AWS_REGION is automatically available in Lambda environment

const rateLimiter = new RateLimiter();

// Initialize shared services (lazy initialization)
let chatHistoryStore: ChatHistoryStore | null = null;
let ragSystem: RAGSystem | null = null;
let cacheLayer: CacheLayer | null = null;
let bedrockService: BedrockService | null = null;
let inlineAgentService: InlineAgentService | null = null;
let mcpToolRegistry: MCPToolRegistry | null = null;

// Circuit breakers for external services (Requirement 14.4)
const bedrockCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 60 seconds
    name: 'bedrock-service',
});

const vectorStoreCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 60 seconds
    name: 'vector-store',
});

const cacheCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
    name: 'cache-layer',
});

const agentCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 60 seconds
    name: 'inline-agent',
});

interface ChatMessagePayload {
    action: string;
    data: {
        message: string;
        sessionId: string;
    };
}

interface ConnectionRecord {
    PK: string;
    SK: string;
    connectionId: string;
    userId: string;
    connectedAt: number;
    ttl: number;
}

/**
 * WebSocket chat message handler
 * 
 * Handles chat_message action from WebSocket connections.
 * Implements requirements:
 * - 10.1: Rate limiting check (60 requests per minute per user)
 * - 11.1: Audit logging for user actions
 * - 15.1: Emit execution duration metrics
 */
export const handler = async (
    event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
    const startTime = Date.now();
    console.log('WebSocket message event:', JSON.stringify(event, null, 2));

    const connectionId = event.requestContext.connectionId;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;

    // Create MessageSender instance
    const apiEndpoint = `https://${domainName}/${stage}`;
    const messageSender = new MessageSender(apiEndpoint, CONNECTIONS_TABLE);

    let userId: string | undefined;

    try {
        // Parse the incoming message
        const payload: ChatMessagePayload = JSON.parse(event.body || '{}');

        // Validate action type
        if (payload.action !== 'chat_message') {
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    'INVALID_ACTION',
                    'Invalid action type. Expected "chat_message".',
                    false
                )
            );

            // Emit execution duration metric
            await emitExecutionDuration({
                functionName: 'websocket-message-handler',
                duration: Date.now() - startTime,
            });
            await flushMetrics();

            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid action type' })
            };
        }

        // Validate message content
        if (!payload.data?.message || typeof payload.data.message !== 'string') {
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    'INVALID_MESSAGE',
                    'Message content is required and must be a string.',
                    false
                )
            );

            // Emit execution duration metric
            await emitExecutionDuration({
                functionName: 'websocket-message-handler',
                duration: Date.now() - startTime,
            });
            await flushMetrics();

            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid message content' })
            };
        }

        // Extract userId from connection context
        const userContext = await getUserContextFromConnection(connectionId);

        if (!userContext) {
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    'UNAUTHORIZED',
                    'Connection not found or expired. Please reconnect.',
                    true
                )
            );

            // Emit execution duration metric
            await emitExecutionDuration({
                functionName: 'websocket-message-handler',
                duration: Date.now() - startTime,
            });
            await flushMetrics();

            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }

        userId = userContext.userId;

        // Apply rate limiting check
        const rateLimitResult = await rateLimiter.checkRateLimit(userContext);

        if (!rateLimitResult.allowed) {
            const retryAfter = rateLimitResult.retryAfter || 60;

            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    'RATE_LIMIT_EXCEEDED',
                    `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
                    true
                )
            );

            // Emit execution duration metric
            await emitExecutionDuration({
                functionName: 'websocket-message-handler',
                duration: Date.now() - startTime,
                userId: userContext.userId,
            });
            await flushMetrics();

            return {
                statusCode: 429,
                headers: {
                    'Retry-After': retryAfter.toString(),
                },
                body: JSON.stringify({
                    message: 'Rate limit exceeded',
                    retryAfter,
                    resetAt: rateLimitResult.resetAt,
                })
            };
        }

        // Log user action to audit log
        await logUserAction({
            eventType: 'query',
            userId: userContext.userId,
            sessionId: payload.data.sessionId || connectionId,
            timestamp: Date.now(),
            ipAddress: (event.requestContext as any).identity?.sourceIp || 'unknown',
            userAgent: (event.requestContext as any).identity?.userAgent || 'unknown',
            metadata: {
                action: 'chat_message',
                connectionId,
                messageLength: payload.data.message.length,
                remainingRequests: rateLimitResult.remainingRequests,
            },
        });

        console.log(`Chat message received from user ${userContext.userId}: ${payload.data.message.substring(0, 100)}...`);

        // Task 17.2: Implement chat processing pipeline
        const processingResult = await processChatMessage(
            payload.data.message,
            payload.data.sessionId || connectionId,
            userContext.userId,
            connectionId,
            messageSender
        );

        // Emit execution duration metric (Requirement 15.1)
        await emitExecutionDuration({
            functionName: 'websocket-message-handler',
            duration: Date.now() - startTime,
            userId: userContext.userId,
        });

        // Emit query latency metric (Requirement 15.1)
        await emitQueryLatency({
            latency: processingResult.latency,
            userId: userContext.userId,
            cached: processingResult.cached,
        });

        // Flush metrics before returning
        await flushMetrics();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Message processed',
                remainingRequests: rateLimitResult.remainingRequests,
                cached: processingResult.cached,
            })
        };

    } catch (error) {
        console.error('Error processing chat message:', error);

        // Try to send error message to client
        try {
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    'INTERNAL_ERROR',
                    'An internal error occurred while processing your message.',
                    true
                )
            );
        } catch (sendError) {
            console.error('Failed to send error message to client:', sendError);
        }

        // Emit execution duration metric even on error
        await emitExecutionDuration({
            functionName: 'websocket-message-handler',
            duration: Date.now() - startTime,
            userId,
        });
        await flushMetrics();

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};

/**
 * Retrieve user context from connection record in DynamoDB
 * 
 * @param connectionId WebSocket connection ID
 * @returns UserContext or null if not found
 */
async function getUserContextFromConnection(connectionId: string): Promise<UserContext | null> {
    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: CONNECTIONS_TABLE,
                Key: {
                    PK: `CONNECTION#${connectionId}`,
                    SK: `CONNECTION#${connectionId}`,
                },
            })
        );

        if (!result.Item) {
            console.error(`Connection not found: ${connectionId}`);
            return null;
        }

        const record = result.Item as ConnectionRecord;

        // Check if connection has expired (TTL check)
        const now = Math.floor(Date.now() / 1000);
        if (record.ttl && record.ttl < now) {
            console.error(`Connection expired: ${connectionId}`);
            return null;
        }

        // Return user context
        // Note: roles default to empty array since we don't store them in connection record
        // In a production system, you might want to fetch user details from a Users table
        return {
            userId: record.userId,
            username: record.userId, // Using userId as username for now
            roles: [], // Default to no special roles
            sessionId: connectionId,
        };

    } catch (error) {
        console.error('Error fetching connection from DynamoDB:', error);
        return null;
    }
}

/**
 * Initialize shared services (lazy initialization)
 */
function initializeServices(): void {
    if (!chatHistoryStore && CHAT_HISTORY_TABLE && KMS_KEY_ID) {
        chatHistoryStore = new ChatHistoryStore({
            tableName: CHAT_HISTORY_TABLE,
            kmsKeyId: KMS_KEY_ID,
            // region is auto-detected from Lambda environment
        });
    }

    if (!ragSystem && OPENSEARCH_ENDPOINT) {
        ragSystem = new RAGSystem({
            opensearchEndpoint: OPENSEARCH_ENDPOINT,
            // region is auto-detected from Lambda environment
            cacheHost: CACHE_HOST,
            cachePort: CACHE_PORT,
            metricsCallback: async (latency, resultCount, scores) => {
                // Emit search latency metrics
                try {
                    await emitQueryLatency({
                        latency,
                        cached: false,
                    });
                } catch (error) {
                    console.error('Failed to emit search latency metrics:', error);
                }
            },
        });
    }

    if (!cacheLayer && CACHE_HOST) {
        cacheLayer = new CacheLayer({
            host: CACHE_HOST,
            port: CACHE_PORT,
        });
    }

    if (!bedrockService) {
        bedrockService = new BedrockService({
            // region is auto-detected from Lambda environment
        });
    }

    if (!inlineAgentService) {
        inlineAgentService = new InlineAgentService({});
    }

    if (!mcpToolRegistry && MCP_SERVER_CONFIG_TABLE) {
        mcpToolRegistry = new MCPToolRegistry({
            tableName: MCP_SERVER_CONFIG_TABLE,
        });
    }
}

/**
 * Process chat message through the pipeline
 * 
 * Task 17.2: Implement chat processing pipeline
 * - Retrieve conversation history from Chat History Store (last 10 messages)
 * - Classify query using Query Router
 * - If requiresRetrieval=true, invoke RAG System to retrieve context
 * - Check cache for identical query hash
 * - If cache miss, assemble prompt with context and history
 * 
 * Task 17.3: Implement streaming response delivery
 * - Send typing_indicator message via WebSocket
 * - Invoke Bedrock Service with streaming enabled
 * - Stream response chunks to client via WebSocket as they arrive
 * - Send chat_response messages with isComplete flag
 * - Include retrievedChunks metadata in final message
 * 
 * Task 17.5: Implement error handling and fallback
 * - Wrap all operations in try-catch blocks
 * - If Vector Store unavailable, fall back to direct LLM without retrieval
 * - If Bedrock fails after retries, return user-friendly error via WebSocket
 * - Implement circuit breaker for external services (5 failure threshold)
 * 
 * Requirements: 2.2, 2.5, 3.1, 3.4, 7.4, 7.5, 12.1, 12.3, 14.1, 14.2, 14.4
 */
async function processChatMessage(
    message: string,
    sessionId: string,
    userId: string,
    connectionId: string,
    messageSender: MessageSender
): Promise<{ cached: boolean; latency: number }> {
    const processingStartTime = Date.now();

    // Wrap entire pipeline in try-catch (Requirement 14.1)
    try {
        // Initialize services if not already done
        initializeServices();

        // Step 1: Retrieve conversation history from Chat History Store (last 10 messages)
        console.log('Retrieving conversation history...');
        let conversationHistory: any[] = [];

        if (chatHistoryStore) {
            try {
                const historyResult = await chatHistoryStore.getHistory(userId, sessionId, 10);
                conversationHistory = historyResult.messages
                    .filter(msg => msg.content && msg.content.trim().length > 0) // Filter out empty messages
                    .map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp,
                    }));
                console.log(`Retrieved ${conversationHistory.length} messages from history`);
            } catch (error) {
                console.error('Error retrieving chat history:', error);
                // Continue without history - not critical
            }
        }

        // Step 2: Check cache for identical query hash
        console.log('Checking cache for query...');
        let cachedResponse: string | null = null;

        if (cacheLayer) {
            try {
                // Use circuit breaker for cache operations (Requirement 14.4)
                cachedResponse = await cacheCircuitBreaker.execute(async () => {
                    await cacheLayer!.connect();
                    return await cacheLayer!.getCachedResponse(message);
                });

                if (cachedResponse) {
                    console.log('Cache hit! Returning cached response');

                    // Send cached response to client
                    const messageId = `msg-${Date.now()}`;
                    await messageSender.sendMessage(
                        connectionId,
                        MessageSender.createChatResponse(
                            messageId,
                            cachedResponse,
                            true,
                            undefined
                        )
                    );

                    const latency = Date.now() - processingStartTime;
                    return { cached: true, latency };
                }

                console.log('Cache miss');
            } catch (error) {
                if (error instanceof CircuitBreakerError) {
                    console.warn(`Cache circuit breaker is open: ${error.message}`);
                } else {
                    console.error('Error checking cache:', error);
                }
                // Continue without cache - not critical (Requirement 14.2)
            }
        }

        // Step 3: Classify query using Query Router
        console.log('Classifying query...');
        const classification = classifyQuery(message, conversationHistory);
        console.log(`Query classification: requiresRetrieval=${classification.requiresRetrieval}, routeType=${classification.routeType}, confidence=${classification.confidence}, k=${classification.suggestedK}`);

        // Step 3b: If routeType === 'agent', execute via Inline Agent path
        if (classification.routeType === 'agent' && inlineAgentService) {
            try {
                const agentResult = await executeAgentPath(
                    message,
                    sessionId,
                    userId,
                    connectionId,
                    messageSender,
                    conversationHistory,
                );

                // Save messages to chat history
                if (chatHistoryStore && agentResult.fullResponse) {
                    try {
                        await chatHistoryStore.saveMessage({
                            userId,
                            sessionId,
                            messageId: `user-${Date.now()}`,
                            timestamp: Date.now(),
                            role: 'user',
                            content: message,
                            metadata: {},
                        });
                        await chatHistoryStore.saveMessage({
                            userId,
                            sessionId,
                            messageId: agentResult.messageId,
                            timestamp: Date.now(),
                            role: 'assistant',
                            content: agentResult.fullResponse,
                            metadata: { agentRoute: true },
                        });
                    } catch (historyError) {
                        console.error('Error saving agent chat history:', historyError);
                    }
                }

                const latency = Date.now() - processingStartTime;
                return { cached: false, latency };
            } catch (agentError) {
                // Fall back to standard RAG pipeline on agent failure (Requirement 14.2, 17.1)
                console.warn('Agent execution failed, falling back to standard RAG pipeline:', agentError);
                await messageSender.sendMessage(
                    connectionId,
                    MessageSender.createSystem(
                        'Agent mode unavailable, using standard search instead.',
                        'warning'
                    )
                );
                // Continue to RAG/direct path below
            }
        }

        // Step 4: If requiresRetrieval=true, invoke RAG System to retrieve context
        let retrievedChunks: any[] = [];
        let assembledContext: any = null;
        let vectorStoreAvailable = true;

        if (classification.requiresRetrieval && ragSystem) {
            try {
                console.log('Retrieving context from RAG system...');

                // Use circuit breaker for vector store operations (Requirement 14.4)
                const retrievalResult = await vectorStoreCircuitBreaker.execute(async () => {
                    await ragSystem!.initialize();
                    return await ragSystem!.retrieveContext(message, {
                        k: classification.suggestedK,
                    });
                });

                retrievedChunks = retrievalResult.chunks;
                console.log(`Retrieved ${retrievedChunks.length} chunks (fromCache: ${retrievalResult.fromCache})`);

                // Step 5: Assemble prompt with context and history
                console.log('Assembling context for LLM...');
                assembledContext = ragSystem.assembleContext(
                    message,
                    retrievedChunks,
                    conversationHistory,
                    {
                        maxContextTokens: 180000,
                        conversationWindowSize: 10,
                    }
                );

                console.log(`Context assembled: ${assembledContext.totalTokens} tokens, truncated: ${assembledContext.truncated}`);
            } catch (error) {
                if (error instanceof CircuitBreakerError) {
                    console.warn(`Vector Store circuit breaker is open: ${error.message}`);
                    vectorStoreAvailable = false;
                } else {
                    console.error('Error in RAG retrieval:', error);
                    vectorStoreAvailable = false;
                }

                // Fall back to direct LLM without retrieval (Requirement 14.2)
                console.log('Falling back to direct LLM without RAG retrieval');

                // Send informational message to user
                await messageSender.sendMessage(
                    connectionId,
                    MessageSender.createSystem(
                        'Document search is temporarily unavailable. Responding without document context.',
                        'warning'
                    )
                );
            }
        }

        // Task 17.3: Implement streaming response delivery

        // Step 1: Send typing indicator
        console.log('Sending typing indicator...');
        await messageSender.sendMessage(
            connectionId,
            MessageSender.createTypingIndicator(true)
        );

        // Step 2: Prepare prompt for Bedrock
        let finalPrompt = message;
        let systemPrompt: string | undefined;
        let conversationHistoryForBedrock = conversationHistory;

        if (assembledContext) {
            // Use assembled context with RAG
            finalPrompt = assembledContext.userPrompt;
            systemPrompt = assembledContext.systemPrompt;
            conversationHistoryForBedrock = assembledContext.conversationHistory;
        }

        // Validate that finalPrompt is not empty
        if (!finalPrompt || finalPrompt.trim().length === 0) {
            console.error('Final prompt is empty, using original message');
            finalPrompt = message || 'Hello'; // Fallback to original message or default
        }

        // Step 3: Invoke Bedrock Service with streaming enabled
        console.log('Invoking Bedrock Service with streaming...');
        if (!bedrockService) {
            throw new Error('Bedrock Service not initialized');
        }

        const messageId = `msg-${Date.now()}`;
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const startTime = Date.now();
        let fullResponse = '';
        let tokenCount = 0;

        try {
            // Use circuit breaker for Bedrock operations (Requirement 14.4)
            await bedrockCircuitBreaker.execute(async () => {
                // Stream response chunks to client
                for await (const chunk of bedrockService!.generateResponse({
                    prompt: finalPrompt,
                    systemPrompt,
                    conversationHistory: conversationHistoryForBedrock
                        .filter(msg => msg.content && msg.content.trim().length > 0) // Filter empty messages again
                        .map(msg => ({
                            role: msg.role as 'user' | 'assistant',
                            content: msg.content,
                        })),
                    maxTokens: 2048,
                    temperature: 0.7
                })) {
                    if (chunk.text) {
                        fullResponse += chunk.text;

                        // Send accumulated content to client (not just the delta)
                        // This allows the frontend to simply replace the content each time
                        await messageSender.sendMessage(
                            connectionId,
                            MessageSender.createChatResponse(
                                messageId,
                                fullResponse,  // Send full accumulated content
                                false
                            )
                        );
                    }

                    if (chunk.isComplete) {
                        tokenCount = chunk.tokenCount || 0;

                        // Send final message with full accumulated content and retrievedChunks metadata
                        const retrievedChunksMetadata = retrievedChunks.length > 0
                            ? retrievedChunks.map(chunk => ({
                                chunkId: chunk.chunkId,
                                documentId: chunk.documentId,
                                documentName: chunk.documentName,
                                pageNumber: chunk.pageNumber,
                                text: chunk.text.substring(0, 500), // Truncate for metadata but keep more context
                                score: chunk.score,
                                metadata: chunk.metadata,
                            }))
                            : undefined;

                        await messageSender.sendMessage(
                            connectionId,
                            MessageSender.createChatResponse(
                                messageId,
                                fullResponse,  // Send full accumulated content, not empty string
                                true,
                                retrievedChunksMetadata
                            )
                        );

                        console.log(`Streaming complete. Total tokens: ${tokenCount}, Response length: ${fullResponse.length}`);
                    }
                }
            });

            // Calculate duration for audit log
            const duration = Date.now() - startTime;

            // Task 17.4: Log API call to audit log with token count and latency
            try {
                await logAPICall({
                    service: 'bedrock',
                    operation: 'generateResponse',
                    requestId,
                    userId,
                    timestamp: startTime,
                    duration,
                    statusCode: 200,
                    tokenCount,
                });
                console.log('API call logged to audit log');
            } catch (error) {
                console.error('Error logging API call:', error);
                // Non-critical, continue
            }

            // Emit Bedrock token usage metrics (Requirement 15.3)
            try {
                // Note: Bedrock doesn't provide separate input/output token counts in streaming mode
                // We'll emit the total as output tokens for now
                await emitTokenUsage({
                    inputTokens: 0, // Not available in streaming response
                    outputTokens: tokenCount,
                    userId,
                    model: 'claude-haiku-4.5',
                });
                console.log('Token usage metrics emitted');
            } catch (error) {
                console.error('Error emitting token usage metrics:', error);
                // Non-critical, continue
            }

            // Task 17.4: Cache complete response with 1-hour TTL
            if (cacheLayer && fullResponse) {
                try {
                    await cacheCircuitBreaker.execute(async () => {
                        await cacheLayer!.setCachedResponse(message, fullResponse);
                    });
                    console.log('Response cached successfully');
                } catch (error) {
                    if (error instanceof CircuitBreakerError) {
                        console.warn(`Cache circuit breaker is open: ${error.message}`);
                    } else {
                        console.error('Error caching response:', error);
                    }
                    // Non-critical, continue
                }
            }

            // Task 17.4: Save messages to chat history
            if (chatHistoryStore) {
                try {
                    // Save user message
                    await chatHistoryStore.saveMessage({
                        userId,
                        sessionId,
                        messageId: `user-${Date.now()}`,
                        timestamp: Date.now(),
                        role: 'user',
                        content: message,
                        metadata: {},
                    });

                    // Save assistant response
                    await chatHistoryStore.saveMessage({
                        userId,
                        sessionId,
                        messageId,
                        timestamp: Date.now(),
                        role: 'assistant',
                        content: fullResponse,
                        metadata: {
                            retrievedChunks: retrievedChunks.map(c => c.chunkId),
                            tokenCount,
                        },
                    });

                    console.log('Messages saved to chat history');
                } catch (error) {
                    console.error('Error saving to chat history:', error);
                    // Non-critical, continue
                }
            }

            const latency = Date.now() - processingStartTime;
            return { cached: false, latency };

        } catch (error) {
            console.error('Error during streaming response:', error);

            // Determine error type and send appropriate user-friendly message (Requirement 14.1)
            let errorCode = 'BEDROCK_ERROR';
            let errorMessage = 'An error occurred while generating the response. Please try again.';
            let retryable = true;

            if (error instanceof CircuitBreakerError) {
                // Circuit breaker is open - Bedrock service unavailable (Requirement 14.1)
                errorCode = 'SERVICE_UNAVAILABLE';
                errorMessage = 'The AI service is temporarily unavailable. Please try again in a few moments.';
                retryable = true;
                console.error('Bedrock circuit breaker is open:', error.message);
            } else if (error instanceof Error) {
                // Check for specific Bedrock errors
                if (error.message.includes('ThrottlingException')) {
                    errorCode = 'THROTTLED';
                    errorMessage = 'The service is experiencing high demand. Please try again in a moment.';
                    retryable = true;
                } else if (error.message.includes('ValidationException')) {
                    errorCode = 'INVALID_REQUEST';
                    errorMessage = 'Your request could not be processed. Please try rephrasing your message.';
                    retryable = false;
                } else if (error.message.includes('ModelTimeoutException')) {
                    errorCode = 'TIMEOUT';
                    errorMessage = 'The request took too long to process. Please try a shorter message.';
                    retryable = true;
                }
            }

            // Send user-friendly error message to client
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createError(
                    errorCode,
                    errorMessage,
                    retryable
                )
            );

            throw error;
        }

    } catch (error) {
        console.error('Error in chat processing pipeline:', error);

        // Determine if error was already handled and sent to client
        const isCircuitBreakerError = error instanceof CircuitBreakerError;
        const errorAlreadyHandled = isCircuitBreakerError || (error instanceof Error && error.message.includes('Bedrock'));

        if (!errorAlreadyHandled) {
            // Send generic error to client for unexpected errors
            try {
                await messageSender.sendMessage(
                    connectionId,
                    MessageSender.createError(
                        'PROCESSING_ERROR',
                        'An unexpected error occurred while processing your message. Please try again.',
                        true
                    )
                );
            } catch (sendError) {
                console.error('Failed to send error message to client:', sendError);
            }
        }

        throw error;
    }
}

/**
 * Build the built-in action group config (SearchDocuments, GetDocumentMetadata, ListUserDocuments).
 * This is always included in every agent invocation.
 */
function getBuiltinActionGroupConfig(): ActionGroupConfig {
    return {
        actionGroupName: BUILTIN_ACTION_GROUP,
        description: 'Built-in document tools for searching, retrieving metadata, and listing user documents.',
        actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
        functionSchema: {
            functions: [
                {
                    name: 'SearchDocuments',
                    description: 'Search uploaded documents for information relevant to a query. Returns matching text passages with document name and page number citations.',
                    parameters: {
                        query: { type: 'string', description: 'The search query', required: true },
                        maxResults: { type: 'integer', description: 'Maximum number of results (1-20, default 5)', required: false },
                    },
                },
                {
                    name: 'GetDocumentMetadata',
                    description: 'Get metadata about a specific document including filename, upload date, page count, and processing status.',
                    parameters: {
                        documentId: { type: 'string', description: 'The document ID to look up', required: true },
                    },
                },
                {
                    name: 'ListUserDocuments',
                    description: 'List all documents uploaded by the current user with their metadata.',
                    parameters: {
                        limit: { type: 'integer', description: 'Maximum number of documents to return (default 20)', required: false },
                    },
                },
            ],
        },
    };
}

/**
 * Execute the agent path for queries classified as routeType === 'agent'.
 *
 * 1. Load enabled MCP server configs from registry
 * 2. Initialize MCP Client Bridge and discover tools
 * 3. Build action groups (built-in + MCP-derived)
 * 4. Invoke Inline Agent Service with streaming
 * 5. Stream AgentResponseChunk text to WebSocket client
 * 6. Optionally stream agent_trace events for debugging
 *
 * Wrapped in circuit breaker; falls back to standard RAG pipeline on failure.
 *
 * Requirements: 14.1, 14.2, 14.4, 17.1
 */
async function executeAgentPath(
    message: string,
    sessionId: string,
    userId: string,
    connectionId: string,
    messageSender: MessageSender,
    conversationHistory: Array<{ role: string; content: string; timestamp?: number }>,
): Promise<{ fullResponse: string; messageId: string }> {
    const messageId = `agent-${Date.now()}`;
    let mcpBridge: MCPClientBridge | null = null;

    try {
        return await agentCircuitBreaker.execute(async () => {
            // Step 1: Send typing indicator
            await messageSender.sendMessage(
                connectionId,
                MessageSender.createTypingIndicator(true),
            );

            // Step 2: Load enabled MCP server configs from registry
            let mcpActionGroups: ActionGroupConfig[] = [];
            if (mcpToolRegistry) {
                try {
                    const enabledServers = await mcpToolRegistry.getEnabledServers();
                    // Filter out stdio transport servers — Lambda cannot spawn child processes
                    const connectableServers = enabledServers.filter(s => s.transport !== 'stdio');
                    if (connectableServers.length > 0) {
                        mcpBridge = new MCPClientBridge();
                        await mcpBridge.initialize(connectableServers);
                        await mcpBridge.discoverTools();
                        mcpActionGroups = mcpBridge.toActionGroups();
                        console.log(`Discovered ${mcpActionGroups.length} MCP action group(s) from ${connectableServers.length} server(s)`);
                    }
                    if (enabledServers.length !== connectableServers.length) {
                        console.log(`Skipped ${enabledServers.length - connectableServers.length} stdio-transport server(s) (not supported in Lambda)`);
                    }
                } catch (mcpError) {
                    console.warn('Failed to load MCP tools, continuing with built-in tools only:', mcpError);
                }
            }

            // Step 3: Build action groups (built-in + MCP-derived)
            const builtinActionGroup = getBuiltinActionGroupConfig();
            const allActionGroups = [builtinActionGroup, ...mcpActionGroups];

            // Step 4: Build agent instruction
            const instruction = buildAgentInstruction({
                actionGroups: allActionGroups,
                userContext: { userId },
            });

            // Step 5: Create tool executor that routes to built-in or MCP tools
            const builtinExecutor = createBuiltinToolExecutor({
                retrieveContext: async (query: string, options?: { k?: number }) => {
                    if (!ragSystem) throw new Error('RAG system not available');
                    await ragSystem.initialize();
                    return ragSystem.retrieveContext(query, options);
                },
                documentMetadataTable: DOCUMENT_METADATA_TABLE,
                userId,
            });

            const toolExecutor = async (
                actionGroup: string,
                functionName: string,
                parameters: Record<string, string>,
            ): Promise<ToolExecutionResult> => {
                // Try built-in tools first
                const builtinResult = await builtinExecutor(actionGroup, functionName, parameters);
                if (builtinResult !== null) {
                    return builtinResult;
                }

                // Route to MCP bridge
                if (mcpBridge) {
                    const mcpResult = await mcpBridge.executeTool(actionGroup, functionName, parameters);
                    const textParts = mcpResult.content
                        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                        .map(c => c.text);
                    return {
                        body: textParts.join('\n') || 'No output',
                        isError: mcpResult.isError,
                    };
                }

                return { body: `Unknown tool: ${actionGroup}.${functionName}`, isError: true };
            };

            // Step 6: Invoke Inline Agent Service with tool loop
            const agentStream = inlineAgentService!.invokeAgentWithToolLoop(
                {
                    inputText: message,
                    sessionId,
                    userId,
                    instruction,
                    foundationModel: AGENT_FOUNDATION_MODEL,
                    actionGroups: allActionGroups,
                    conversationHistory: conversationHistory
                        .filter(msg => msg.content && msg.content.trim().length > 0)
                        .map(msg => ({
                            role: msg.role as 'user' | 'assistant',
                            content: msg.content,
                        })),
                    enableTrace: process.env.AGENT_ENABLE_TRACE === 'true',
                },
                toolExecutor,
                { maxIterations: AGENT_MAX_ITERATIONS },
            );

            // Step 7: Stream response chunks to WebSocket client
            let fullResponse = '';

            for await (const chunk of agentStream) {
                if (chunk.type === 'text' && chunk.text) {
                    fullResponse += chunk.text;
                    await messageSender.sendMessage(
                        connectionId,
                        MessageSender.createChatResponse(messageId, fullResponse, false),
                    );
                }

                // Optionally stream trace events for debugging
                if (chunk.type === 'trace' && chunk.trace) {
                    console.log('[AgentTrace]', JSON.stringify(chunk.trace));
                }

                if (chunk.isComplete) {
                    await messageSender.sendMessage(
                        connectionId,
                        MessageSender.createChatResponse(messageId, fullResponse, true),
                    );
                }
            }

            // If no complete chunk was yielded, send final message
            if (fullResponse) {
                await messageSender.sendMessage(
                    connectionId,
                    MessageSender.createChatResponse(messageId, fullResponse, true),
                );
            }

            return { fullResponse, messageId };
        });
    } finally {
        // Always clean up MCP bridge connections
        // Type assertion needed: mcpBridge is assigned inside the circuit breaker callback,
        // but TypeScript's control flow analysis can't track assignments through closures.
        const bridge = mcpBridge as MCPClientBridge | null;
        if (bridge) {
            try {
                await bridge.disconnect();
            } catch (disconnectError) {
                console.warn('Error disconnecting MCP bridge:', disconnectError);
            }
        }
    }
}
