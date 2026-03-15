/**
 * Chat History Store - DynamoDB persistence with KMS encryption
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { EncryptionService } from './encryption.js';
import type { ChatMessage, ChatHistoryRecord, ChatHistoryConfig } from './types.js';

export class ChatHistoryStore {
    private docClient: DynamoDBDocumentClient;
    private tableName: string;
    private encryptionService: EncryptionService;
    private ttlDays: number;

    constructor(config: ChatHistoryConfig = {}) {
        const region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.tableName = config.tableName || process.env.CHAT_HISTORY_TABLE_NAME || 'ChatHistory';
        this.ttlDays = config.ttlDays || 90;

        const client = new DynamoDBClient({ region });
        this.docClient = DynamoDBDocumentClient.from(client, {
            marshallOptions: {
                removeUndefinedValues: true,
            },
        });

        const kmsKeyId = config.kmsKeyId || process.env.KMS_KEY_ID;
        if (!kmsKeyId) {
            throw new Error('KMS Key ID is required for chat history encryption');
        }

        this.encryptionService = new EncryptionService(kmsKeyId, region);
    }

    /**
     * Save a message to chat history
     * Validates Requirements: 8.1, 8.2, 8.4, 8.5
     */
    async saveMessage(message: ChatMessage): Promise<void> {
        const startTime = Date.now();

        try {
            // Encrypt message content
            const encryptedContent = await this.encryptionService.encrypt(message.content);

            // Calculate TTL (90 days from now)
            const ttl = Math.floor(Date.now() / 1000) + (this.ttlDays * 24 * 60 * 60);

            // Create composite key
            const PK = `USER#${message.userId}#SESSION#${message.sessionId}`;
            const SK = message.timestamp;

            const record: ChatHistoryRecord = {
                PK,
                SK,
                messageId: message.messageId,
                role: message.role,
                content: encryptedContent,
                metadata: {
                    retrievedChunks: message.metadata?.retrievedChunks,
                    tokenCount: message.metadata?.tokenCount,
                    latency: message.metadata?.latency,
                    agentRoute: message.metadata?.agentRoute,
                },
                ttl,
            };

            const command = new PutCommand({
                TableName: this.tableName,
                Item: record,
            });

            await this.docClient.send(command);

            const duration = Date.now() - startTime;

            // Ensure operation completes within 1 second (Requirement 8.1)
            if (duration > 1000) {
                console.warn(`saveMessage took ${duration}ms, exceeding 1 second requirement`);
            }
        } catch (error) {
            console.error('Error saving message to chat history:', error);
            throw new Error(`Failed to save message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Retrieve conversation history for a user session
     * Validates Requirements: 8.3
     * 
     * @param userId - User identifier
     * @param sessionId - Session identifier
     * @param limit - Maximum number of messages to retrieve (default: 50)
     * @param nextToken - Pagination token from previous request (optional)
     * @returns Object containing messages array and optional nextToken for pagination
     */
    async getHistory(
        userId: string,
        sessionId: string,
        limit: number = 50,
        nextToken?: string
    ): Promise<{ messages: ChatMessage[]; nextToken?: string }> {
        const startTime = Date.now();

        try {
            const PK = `USER#${userId}#SESSION#${sessionId}`;

            const command = new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': PK,
                },
                Limit: limit,
                ScanIndexForward: false, // Get most recent messages first
                ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8')) : undefined,
            });

            const response = await this.docClient.send(command);

            if (!response.Items || response.Items.length === 0) {
                return { messages: [] };
            }

            // Decrypt messages
            const messages: ChatMessage[] = [];
            for (const item of response.Items) {
                const record = item as ChatHistoryRecord;

                try {
                    const decryptedContent = await this.encryptionService.decrypt(record.content);

                    messages.push({
                        userId,
                        sessionId,
                        messageId: record.messageId,
                        timestamp: record.SK,
                        role: record.role,
                        content: decryptedContent,
                        metadata: {
                            retrievedChunks: record.metadata?.retrievedChunks,
                            tokenCount: record.metadata?.tokenCount,
                            latency: record.metadata?.latency,
                        },
                    });
                } catch (decryptError) {
                    console.error(`Failed to decrypt message ${record.messageId}:`, decryptError);
                    // Skip messages that fail to decrypt
                }
            }

            const duration = Date.now() - startTime;

            // Ensure operation completes within 500ms (Requirement 8.3)
            if (duration > 500) {
                console.warn(`getHistory took ${duration}ms, exceeding 500ms requirement`);
            }

            // Encode nextToken if there are more results
            const result: { messages: ChatMessage[]; nextToken?: string } = { messages };
            if (response.LastEvaluatedKey) {
                result.nextToken = Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64');
            }

            return result;
        } catch (error) {
            console.error('Error retrieving chat history:', error);
            throw new Error(`Failed to retrieve history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete expired history (handled automatically by DynamoDB TTL)
     * This method is provided for manual cleanup if needed
     */
    async deleteExpiredHistory(): Promise<void> {
        // DynamoDB TTL handles automatic deletion
        // This is a no-op but provided for interface compatibility
        console.log('Expired history is automatically deleted by DynamoDB TTL');
    }
}
