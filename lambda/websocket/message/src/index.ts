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

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || '';
const CHAT_HISTORY_TABLE = process.env.CHAT_HISTORY_TABLE || '';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const CACHE_HOST = process.env.CACHE_HOST || '';
const CACHE_PORT = parseInt(process.env.CACHE_PORT || '6379', 10);
// AWS_REGION is automatically available in Lambda environment

const rateLimiter = new RateLimiter();

// Initialize shared services (lazy initialization)
let chatHistoryStore: ChatHistoryStore | null = null;
let ragSystem: RAGSystem | null = null;
let cacheLayer: CacheLayer | null = null;
let bedrockService: BedrockService | null = null;

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
 */
export const handler = async (
    event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
    console.log('WebSocket message event:', JSON.stringify(event, null, 2));

    const connectionId = event.requestContext.connectionId;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;

    // Create MessageSender instance
    const apiEndpoint = `https://${domainName}/${stage}`;
    const messageSender = new MessageSender(apiEndpoint, CONNECTIONS_TABLE);

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

            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }

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
): Promise<{ cached: boolean }> {
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

                    return { cached: true };
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
        console.log(`Query classification: requiresRetrieval=${classification.requiresRetrieval}, confidence=${classification.confidence}, k=${classification.suggestedK}`);

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

        if (assembledContext) {
            // Use assembled context with RAG
            finalPrompt = assembledContext.prompt;
            systemPrompt = assembledContext.systemPrompt;
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
                    conversationHistory: conversationHistory
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

                        // Send chunk to client
                        await messageSender.sendMessage(
                            connectionId,
                            MessageSender.createChatResponse(
                                messageId,
                                chunk.text,
                                false
                            )
                        );
                    }

                    if (chunk.isComplete) {
                        tokenCount = chunk.tokenCount || 0;

                        // Send final message with full accumulated content and retrievedChunks metadata
                        const retrievedChunksMetadata = retrievedChunks.length > 0
                            ? retrievedChunks.map(chunk => ({
                                documentName: chunk.documentName,
                                pageNumber: chunk.pageNumber,
                                text: chunk.text.substring(0, 200), // Truncate for metadata
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

            return { cached: false };

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
