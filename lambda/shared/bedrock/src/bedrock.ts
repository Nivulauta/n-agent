/**
 * Bedrock Service - Claude Haiku 4.5 Client Wrapper
 * 
 * Provides streaming and non-streaming interfaces to Claude Haiku 4.5 via Amazon Bedrock.
 * Implements requirements 3.1 and 3.2 from the design specification.
 */

import {
    BedrockRuntimeClient,
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
    GenerationRequest,
    ResponseChunk,
    BedrockConfig,
    ConversationMessage,
} from './types.js';
import { withRetry, withRetryGenerator } from './retry.js';

const DEFAULT_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 0.9;

export class BedrockService {
    private client: BedrockRuntimeClient;
    private modelId: string;
    private defaultMaxTokens: number;
    private defaultTemperature: number;
    private defaultTopP: number;

    constructor(config: BedrockConfig = {}) {
        this.client = new BedrockRuntimeClient({
            region: config.region || process.env.AWS_REGION || 'us-east-1',
        });
        this.modelId = config.modelId || DEFAULT_MODEL_ID;
        this.defaultMaxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
        this.defaultTemperature = config.temperature || DEFAULT_TEMPERATURE;
        this.defaultTopP = config.topP || DEFAULT_TOP_P;
    }

    /**
     * Generate streaming response from Claude Haiku 4.5
     * Yields response chunks as they arrive from Bedrock
     * Implements retry logic with exponential backoff for throttling errors
     */
    async *generateResponse(request: GenerationRequest): AsyncGenerator<ResponseChunk> {
        yield* withRetryGenerator(
            async function* (this: BedrockService) {
                const payload = this.buildRequestPayload(request);

                const command = new InvokeModelWithResponseStreamCommand({
                    modelId: this.modelId,
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify(payload),
                });

                const response = await this.client.send(command);

                if (!response.body) {
                    throw new Error('No response body received from Bedrock');
                }

                let fullText = '';
                let totalTokens = 0;

                for await (const event of response.body) {
                    if (event.chunk?.bytes) {
                        const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

                        if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
                            const text = chunkData.delta.text;
                            fullText += text;

                            yield {
                                text,
                                isComplete: false,
                            };
                        }

                        if (chunkData.type === 'message_delta' && chunkData.usage) {
                            totalTokens = chunkData.usage.output_tokens || 0;
                        }

                        if (chunkData.type === 'message_stop') {
                            yield {
                                text: '',
                                isComplete: true,
                                tokenCount: totalTokens,
                            };
                        }
                    }
                }
            }.bind(this),
            {},
            'BedrockService.generateResponse'
        );
    }

    /**
     * Generate non-streaming response from Claude Haiku 4.5
     * Returns complete response as a single string
     * Implements retry logic with exponential backoff for throttling errors
     */
    async generateResponseSync(request: GenerationRequest): Promise<string> {
        return withRetry(
            async () => {
                const payload = this.buildRequestPayload(request);

                const command = new InvokeModelCommand({
                    modelId: this.modelId,
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify(payload),
                });

                const response = await this.client.send(command);

                if (!response.body) {
                    throw new Error('No response body received from Bedrock');
                }

                const responseData = JSON.parse(new TextDecoder().decode(response.body));

                if (responseData.content && responseData.content.length > 0) {
                    return responseData.content[0].text || '';
                }

                throw new Error('Invalid response format from Bedrock');
            },
            {},
            'BedrockService.generateResponseSync'
        );
    }

    /**
     * Build the request payload for Claude Haiku 4.5
     * Formats conversation history and system prompt according to Bedrock API spec
     */
    private buildRequestPayload(request: GenerationRequest): Record<string, any> {
        const messages: Array<{ role: string; content: string }> = [];

        // Add conversation history if provided
        if (request.conversationHistory && request.conversationHistory.length > 0) {
            for (const msg of request.conversationHistory) {
                messages.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        // Add current prompt
        messages.push({
            role: 'user',
            content: request.prompt,
        });

        const payload: Record<string, any> = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: request.maxTokens || this.defaultMaxTokens,
            temperature: request.temperature ?? this.defaultTemperature,
            messages,
        };

        // Only add top_p if explicitly provided in request (not using default)
        // Some models don't support both temperature and top_p
        if (request.topP !== undefined) {
            payload.top_p = request.topP;
        }

        // Add system prompt if provided
        if (request.systemPrompt) {
            payload.system = request.systemPrompt;
        }

        // Add stop sequences if provided
        if (request.stopSequences && request.stopSequences.length > 0) {
            payload.stop_sequences = request.stopSequences;
        }

        return payload;
    }
}

/**
 * Format conversation messages with sliding window to limit context size
 * Takes the last N messages to keep context manageable for Claude
 * 
 * @param messages - Array of conversation messages
 * @param windowSize - Maximum number of messages to include (default: 10)
 * @returns Array of messages limited to the window size
 */
export function formatConversationContext(
    messages: ConversationMessage[],
    windowSize: number = 10
): ConversationMessage[] {
    if (!messages || messages.length === 0) {
        return [];
    }

    // Apply sliding window: take the last N messages
    const startIndex = Math.max(0, messages.length - windowSize);
    return messages.slice(startIndex);
}
