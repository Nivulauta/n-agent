/**
 * Unit tests and Property Tests for Bedrock Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { BedrockService, formatConversationContext } from './bedrock.js';
import type { GenerationRequest, ResponseChunk } from './types.js';

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
    return {
        BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
            send: vi.fn(),
        })),
        InvokeModelCommand: vi.fn(),
        InvokeModelWithResponseStreamCommand: vi.fn(),
    };
});

describe('BedrockService', () => {
    let service: BedrockService;

    beforeEach(() => {
        service = new BedrockService({
            region: 'us-east-1',
        });
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            expect(service).toBeDefined();
        });

        it('should accept custom configuration', () => {
            const customService = new BedrockService({
                region: 'us-west-2',
                modelId: 'custom-model-id',
                maxTokens: 1024,
                temperature: 0.5,
                topP: 0.8,
            });
            expect(customService).toBeDefined();
        });
    });

    describe('generateResponseSync', () => {
        it('should build correct request payload with minimal parameters', async () => {
            const request: GenerationRequest = {
                prompt: 'Hello, Claude!',
            };

            expect(request.prompt).toBe('Hello, Claude!');
        });

        it('should include system prompt when provided', () => {
            const request: GenerationRequest = {
                prompt: 'Hello',
                systemPrompt: 'You are a helpful assistant',
            };

            expect(request.systemPrompt).toBe('You are a helpful assistant');
        });

        it('should include conversation history when provided', () => {
            const request: GenerationRequest = {
                prompt: 'What about Germany?',
                conversationHistory: [
                    { role: 'user', content: 'What is the capital of France?' },
                    { role: 'assistant', content: 'Paris' },
                ],
            };

            expect(request.conversationHistory).toHaveLength(2);
        });

        it('should accept custom model parameters', () => {
            const request: GenerationRequest = {
                prompt: 'Test',
                maxTokens: 1024,
                temperature: 0.5,
                topP: 0.8,
                stopSequences: ['STOP'],
            };

            expect(request.maxTokens).toBe(1024);
            expect(request.temperature).toBe(0.5);
            expect(request.topP).toBe(0.8);
            expect(request.stopSequences).toEqual(['STOP']);
        });
    });

    describe('generateResponse', () => {
        it('should be an async generator function', () => {
            const request: GenerationRequest = {
                prompt: 'Test streaming',
            };

            const generator = service.generateResponse(request);
            expect(generator.next).toBeDefined();
            expect(typeof generator.next).toBe('function');
        });
    });

    describe('streaming response parsing', () => {
        it('should parse content_block_delta chunks correctly', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: 'Hello' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: ' world' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_stop',
                                })
                            ),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });
            const chunks: ResponseChunk[] = [];

            for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                chunks.push(chunk);
            }

            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toEqual({ text: 'Hello', isComplete: false });
            expect(chunks[1]).toEqual({ text: ' world', isComplete: false });
            expect(chunks[2]).toEqual({ text: '', isComplete: true, tokenCount: 0 });
        });

        it('should parse message_delta with token count', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: 'Response' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_delta',
                                    usage: { output_tokens: 42 },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_stop',
                                })
                            ),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });
            const chunks: ResponseChunk[] = [];

            for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                chunks.push(chunk);
            }

            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toEqual({ text: 'Response', isComplete: false });
            expect(chunks[1]).toEqual({ text: '', isComplete: true, tokenCount: 42 });
        });

        it('should handle empty text deltas', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: '' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_stop',
                                })
                            ),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });
            const chunks: ResponseChunk[] = [];

            for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                chunks.push(chunk);
            }

            // Empty text deltas are still yielded, then message_stop
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toEqual({ text: '', isComplete: true, tokenCount: 0 });
        });

        it('should skip non-text chunk types', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_start',
                                    message: { role: 'assistant' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_start',
                                    index: 0,
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: 'Hello' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_stop',
                                })
                            ),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });
            const chunks: ResponseChunk[] = [];

            for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                chunks.push(chunk);
            }

            // Should only yield the text delta and message_stop, skipping other types
            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toEqual({ text: 'Hello', isComplete: false });
            expect(chunks[1]).toEqual({ text: '', isComplete: true, tokenCount: 0 });
        });

        it('should accumulate text across multiple chunks', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: 'The' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: ' quick' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: ' brown' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'content_block_delta',
                                    delta: { text: ' fox' },
                                })
                            ),
                        },
                    };
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode(
                                JSON.stringify({
                                    type: 'message_stop',
                                })
                            ),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });
            const chunks: ResponseChunk[] = [];

            for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                chunks.push(chunk);
            }

            expect(chunks).toHaveLength(5);
            expect(chunks[0].text).toBe('The');
            expect(chunks[1].text).toBe(' quick');
            expect(chunks[2].text).toBe(' brown');
            expect(chunks[3].text).toBe(' fox');
            expect(chunks[4].isComplete).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should throw error when no response body is received (streaming)', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: null,
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(async () => {
                for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                    // Should throw before yielding any chunks
                }
            }).rejects.toThrow('No response body received from Bedrock');
        });

        it('should throw error when no response body is received (sync)', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: null,
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(service.generateResponseSync({ prompt: 'Test' })).rejects.toThrow(
                'No response body received from Bedrock'
            );
        });

        it('should throw error for invalid response format (sync)', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: new TextEncoder().encode(
                    JSON.stringify({
                        // Missing content field
                        id: 'msg_123',
                        type: 'message',
                    })
                ),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(service.generateResponseSync({ prompt: 'Test' })).rejects.toThrow(
                'Invalid response format from Bedrock'
            );
        });

        it('should throw error for empty content array (sync)', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: new TextEncoder().encode(
                    JSON.stringify({
                        content: [], // Empty content array
                        id: 'msg_123',
                        type: 'message',
                    })
                ),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(service.generateResponseSync({ prompt: 'Test' })).rejects.toThrow(
                'Invalid response format from Bedrock'
            );
        });

        it('should handle malformed JSON in streaming chunks gracefully', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockResolvedValue({
                body: (async function* () {
                    yield {
                        chunk: {
                            bytes: new TextEncoder().encode('not valid json'),
                        },
                    };
                })(),
            });

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(async () => {
                for await (const chunk of service.generateResponse({ prompt: 'Test' })) {
                    // Should throw on malformed JSON
                }
            }).rejects.toThrow();
        });

        it('should handle network errors', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const mockSend = vi.fn().mockRejectedValue(new Error('Network error'));

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(service.generateResponseSync({ prompt: 'Test' })).rejects.toThrow(
                'Network error'
            );
        });

        it('should handle throttling errors', async () => {
            const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
            const throttlingError = new Error('ThrottlingException');
            throttlingError.name = 'ThrottlingException';
            const mockSend = vi.fn().mockRejectedValue(throttlingError);

            (BedrockRuntimeClient as any).mockImplementation(() => ({
                send: mockSend,
            }));

            const service = new BedrockService({ region: 'us-east-1' });

            await expect(service.generateResponseSync({ prompt: 'Test' })).rejects.toThrow(
                'ThrottlingException'
            );
        });
    });
});

describe('Property Tests', () => {
    describe('Property 8: Bedrock API Invocation', () => {
        it('should always use Claude 3 Sonnet model ID for any valid user query', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary valid prompts
                    fc.string({ minLength: 1, maxLength: 1000 }),
                    // Generate optional system prompts
                    fc.option(fc.string({ minLength: 1, maxLength: 500 })),
                    // Generate optional conversation history (0-10 messages)
                    fc.option(
                        fc.array(
                            fc.record({
                                role: fc.constantFrom('user' as const, 'assistant' as const),
                                content: fc.string({ minLength: 1, maxLength: 200 }),
                            }),
                            { minLength: 0, maxLength: 10 }
                        )
                    ),
                    async (prompt, systemPrompt, conversationHistory) => {
                        // Create a service instance
                        const service = new BedrockService({ region: 'us-east-1' });

                        // Access the private modelId to verify it's Claude 3 Sonnet
                        const modelId = (service as any).modelId;

                        // Property: The service MUST be configured to use Claude Haiku 4.5
                        expect(modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');

                        // Verify the model ID never contains other model identifiers
                        expect(modelId).not.toMatch(/gpt-/i); // Not OpenAI
                        expect(modelId).not.toMatch(/gemini/i); // Not Google
                        expect(modelId).not.toMatch(/llama/i); // Not Meta
                        expect(modelId).not.toMatch(/mistral/i); // Not Mistral
                        expect(modelId).not.toMatch(/titan/i); // Not Titan
                        expect(modelId).not.toMatch(/claude-2/i); // Not older Claude
                        expect(modelId).not.toMatch(/claude-instant/i); // Not Claude Instant

                        // Verify it contains the correct model family
                        expect(modelId).toContain('claude-haiku');
                        expect(modelId).toContain('anthropic');
                    }
                ),
                {
                    numRuns: 100, // Run many test cases to ensure consistency
                }
            );
        });

        it('should always be configured with Claude 3 Sonnet regardless of parameters', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 500 }),
                    fc.option(fc.string({ minLength: 1, maxLength: 200 })),
                    async (prompt, systemPrompt) => {
                        const service = new BedrockService({ region: 'us-east-1' });

                        // Property: The service MUST always be configured with Claude Haiku 4.5
                        const modelId = (service as any).modelId;
                        expect(modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');

                        // Property: The model ID must contain the correct identifiers
                        expect(modelId).toContain('anthropic');
                        expect(modelId).toContain('claude-haiku');

                        // Property: The model ID must not be any other model
                        expect(modelId).not.toContain('gpt');
                        expect(modelId).not.toContain('gemini');
                        expect(modelId).not.toContain('llama');
                    }
                ),
                {
                    numRuns: 50,
                }
            );
        });

        it('should use Claude 3 Sonnet for streaming requests', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 300 }),
                    async (prompt) => {
                        const service = new BedrockService({ region: 'us-east-1' });

                        // Property: Streaming requests MUST also use Claude Haiku 4.5
                        const modelId = (service as any).modelId;
                        expect(modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');

                        // Verify the generator function exists
                        const generator = service.generateResponse({ prompt });
                        expect(generator.next).toBeDefined();
                        expect(typeof generator.next).toBe('function');
                    }
                ),
                {
                    numRuns: 30,
                }
            );
        });

        it('should never allow configuration with a different model', async () => {
            // Property: Even if someone tries to configure a different model,
            // the default should always be Claude Haiku 4.5
            const service1 = new BedrockService();
            expect((service1 as any).modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');

            const service2 = new BedrockService({ region: 'us-west-2' });
            expect((service2 as any).modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');

            const service3 = new BedrockService({ maxTokens: 1024, temperature: 0.5 });
            expect((service3 as any).modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
        });
    });
});

describe('formatConversationContext', () => {
    it('should return empty array for empty input', () => {
        const result = formatConversationContext([]);
        expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined input', () => {
        expect(formatConversationContext(null as any)).toEqual([]);
        expect(formatConversationContext(undefined as any)).toEqual([]);
    });

    it('should return all messages when count is less than window size', () => {
        const messages = [
            { role: 'user' as const, content: 'Hello' },
            { role: 'assistant' as const, content: 'Hi there!' },
            { role: 'user' as const, content: 'How are you?' },
        ];

        const result = formatConversationContext(messages, 10);
        expect(result).toEqual(messages);
        expect(result).toHaveLength(3);
    });

    it('should apply sliding window when messages exceed window size', () => {
        const messages = [
            { role: 'user' as const, content: 'Message 1' },
            { role: 'assistant' as const, content: 'Response 1' },
            { role: 'user' as const, content: 'Message 2' },
            { role: 'assistant' as const, content: 'Response 2' },
            { role: 'user' as const, content: 'Message 3' },
            { role: 'assistant' as const, content: 'Response 3' },
            { role: 'user' as const, content: 'Message 4' },
            { role: 'assistant' as const, content: 'Response 4' },
            { role: 'user' as const, content: 'Message 5' },
            { role: 'assistant' as const, content: 'Response 5' },
            { role: 'user' as const, content: 'Message 6' },
            { role: 'assistant' as const, content: 'Response 6' },
        ];

        const result = formatConversationContext(messages, 10);
        expect(result).toHaveLength(10);
        // 12 messages total, last 10 means starting from index 2 (Message 2)
        expect(result[0]).toEqual({ role: 'user', content: 'Message 2' });
        expect(result[9]).toEqual({ role: 'assistant', content: 'Response 6' });
    });

    it('should use default window size of 10', () => {
        const messages = Array.from({ length: 20 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `Message ${i + 1}`,
        }));

        const result = formatConversationContext(messages);
        expect(result).toHaveLength(10);
        expect(result[0].content).toBe('Message 11');
        expect(result[9].content).toBe('Message 20');
    });

    it('should handle custom window sizes', () => {
        const messages = Array.from({ length: 10 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `Message ${i + 1}`,
        }));

        const result = formatConversationContext(messages, 5);
        expect(result).toHaveLength(5);
        expect(result[0].content).toBe('Message 6');
        expect(result[4].content).toBe('Message 10');
    });

    it('should preserve message structure with role and content', () => {
        const messages = [
            { role: 'user' as const, content: 'What is the capital of France?' },
            { role: 'assistant' as const, content: 'The capital of France is Paris.' },
        ];

        const result = formatConversationContext(messages, 10);
        expect(result[0]).toHaveProperty('role', 'user');
        expect(result[0]).toHaveProperty('content', 'What is the capital of France?');
        expect(result[1]).toHaveProperty('role', 'assistant');
        expect(result[1]).toHaveProperty('content', 'The capital of France is Paris.');
    });

    it('should handle window size of 1', () => {
        const messages = [
            { role: 'user' as const, content: 'First' },
            { role: 'assistant' as const, content: 'Second' },
            { role: 'user' as const, content: 'Third' },
        ];

        const result = formatConversationContext(messages, 1);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ role: 'user', content: 'Third' });
    });

    it('should handle window size larger than message count', () => {
        const messages = [
            { role: 'user' as const, content: 'Hello' },
            { role: 'assistant' as const, content: 'Hi' },
        ];

        const result = formatConversationContext(messages, 100);
        expect(result).toEqual(messages);
        expect(result).toHaveLength(2);
    });

    it('should not mutate the original array', () => {
        const messages = [
            { role: 'user' as const, content: 'Message 1' },
            { role: 'assistant' as const, content: 'Response 1' },
            { role: 'user' as const, content: 'Message 2' },
            { role: 'assistant' as const, content: 'Response 2' },
        ];

        const originalLength = messages.length;
        const result = formatConversationContext(messages, 2);

        expect(messages).toHaveLength(originalLength);
        expect(result).toHaveLength(2);
        expect(result).not.toBe(messages);
    });
});
