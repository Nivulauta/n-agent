/**
 * Unit tests for Embedding Generator
 * 
 * Tests cover:
 * - Single embedding generation
 * - Batch processing
 * - Vector dimension validation (1024)
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingGenerator } from './embeddings.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: vi.fn(),
    InvokeModelCommand: vi.fn(),
}));

describe('EmbeddingGenerator', () => {
    let generator: EmbeddingGenerator;
    let mockSend: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockSend = vi.fn();
        (BedrockRuntimeClient as any).mockImplementation(() => ({
            send: mockSend,
        }));

        generator = new EmbeddingGenerator({
            region: 'us-east-1',
            modelId: 'amazon.titan-embed-text-v2:0',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('generateEmbedding - Single Embedding Generation', () => {
        it('should generate a valid 1024-dimension embedding for text input', async () => {
            // Arrange
            const inputText = 'This is a test document about machine learning.';
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());

            mockSend.mockResolvedValueOnce({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 10,
                })),
            });

            // Act
            const result = await generator.generateEmbedding(inputText);

            // Assert
            expect(result.embedding).toHaveLength(1024);
            expect(result.embedding).toEqual(mockEmbedding);
            expect(result.inputTextTokenCount).toBe(10);
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should validate embedding dimensions are exactly 1024', async () => {
            // Arrange
            const inputText = 'Test text';
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());

            mockSend.mockResolvedValueOnce({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.generateEmbedding(inputText);

            // Assert
            expect(result.embedding).toHaveLength(1024);
            expect(Array.isArray(result.embedding)).toBe(true);
            expect(result.embedding.every(val => typeof val === 'number')).toBe(true);
        });

        it('should throw error for invalid embedding dimensions', async () => {
            // Arrange
            const inputText = 'Test text';
            const invalidEmbedding = new Array(512).fill(0); // Wrong dimension

            mockSend.mockResolvedValueOnce({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: invalidEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act & Assert
            await expect(generator.generateEmbedding(inputText))
                .rejects
                .toThrow('Invalid embedding dimensions: expected 1024, got 512');
        });

        it('should throw error for empty text input', async () => {
            // Act & Assert
            await expect(generator.generateEmbedding(''))
                .rejects
                .toThrow('Input text cannot be empty');

            await expect(generator.generateEmbedding('   '))
                .rejects
                .toThrow('Input text cannot be empty');
        });

        it('should throw error for missing embedding in response', async () => {
            // Arrange
            const inputText = 'Test text';

            mockSend.mockResolvedValueOnce({
                body: new TextEncoder().encode(JSON.stringify({
                    inputTextTokenCount: 5,
                })),
            });

            // Act & Assert
            await expect(generator.generateEmbedding(inputText))
                .rejects
                .toThrow('Invalid response format: missing embedding array');
        });

        it('should throw error for empty response body', async () => {
            // Arrange
            const inputText = 'Test text';

            mockSend.mockResolvedValueOnce({
                body: undefined,
            });

            // Act & Assert
            await expect(generator.generateEmbedding(inputText))
                .rejects
                .toThrow('Empty response from Bedrock');
        });

        it('should call Bedrock with correct parameters', async () => {
            // Arrange
            const inputText = 'Test document';
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());

            mockSend.mockResolvedValueOnce({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            await generator.generateEmbedding(inputText);

            // Assert
            expect(InvokeModelCommand).toHaveBeenCalledWith({
                modelId: 'amazon.titan-embed-text-v2:0',
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({ inputText }),
            });
        });
    });

    describe('batchGenerateEmbeddings - Batch Processing', () => {
        it('should process multiple texts and return all embeddings', async () => {
            // Arrange
            const texts = [
                'First document about AI',
                'Second document about ML',
                'Third document about NLP',
            ];

            const mockEmbeddings = texts.map(() =>
                new Array(1024).fill(0).map(() => Math.random())
            );

            mockSend
                .mockResolvedValueOnce({
                    body: new TextEncoder().encode(JSON.stringify({
                        embedding: mockEmbeddings[0],
                        inputTextTokenCount: 5,
                    })),
                })
                .mockResolvedValueOnce({
                    body: new TextEncoder().encode(JSON.stringify({
                        embedding: mockEmbeddings[1],
                        inputTextTokenCount: 6,
                    })),
                })
                .mockResolvedValueOnce({
                    body: new TextEncoder().encode(JSON.stringify({
                        embedding: mockEmbeddings[2],
                        inputTextTokenCount: 7,
                    })),
                });

            // Act
            const result = await generator.batchGenerateEmbeddings(texts);

            // Assert
            expect(result.embeddings).toHaveLength(3);
            expect(result.embeddings[0]).toHaveLength(1024);
            expect(result.embeddings[1]).toHaveLength(1024);
            expect(result.embeddings[2]).toHaveLength(1024);
            expect(result.totalTokenCount).toBe(18);
            expect(mockSend).toHaveBeenCalledTimes(3);
        });

        it('should process texts in batches of specified size', async () => {
            // Arrange
            const texts = new Array(50).fill(0).map((_, i) => `Document ${i}`);
            const batchSize = 25;

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.batchGenerateEmbeddings(texts, batchSize);

            // Assert
            expect(result.embeddings).toHaveLength(50);
            expect(result.embeddings.every(emb => emb.length === 1024)).toBe(true);
            expect(mockSend).toHaveBeenCalledTimes(50);
        });

        it('should validate all embeddings have 1024 dimensions', async () => {
            // Arrange
            const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'];

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.batchGenerateEmbeddings(texts);

            // Assert
            expect(result.embeddings).toHaveLength(5);
            result.embeddings.forEach(embedding => {
                expect(embedding).toHaveLength(1024);
                expect(Array.isArray(embedding)).toBe(true);
                expect(embedding.every(val => typeof val === 'number')).toBe(true);
            });
        });

        it('should throw error for empty texts array', async () => {
            // Act & Assert
            await expect(generator.batchGenerateEmbeddings([]))
                .rejects
                .toThrow('Input texts array cannot be empty');
        });

        it('should throw error for invalid batch size', async () => {
            // Arrange
            const texts = ['Text 1', 'Text 2'];

            // Act & Assert
            await expect(generator.batchGenerateEmbeddings(texts, 0))
                .rejects
                .toThrow('Batch size must be at least 1');

            await expect(generator.batchGenerateEmbeddings(texts, -1))
                .rejects
                .toThrow('Batch size must be at least 1');
        });

        it('should call progress callback with correct progress info', async () => {
            // Arrange
            const texts = ['Text 1', 'Text 2', 'Text 3'];
            const progressCallback = vi.fn();

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            await generator.batchGenerateEmbeddings(texts, 25, progressCallback);

            // Assert
            expect(progressCallback).toHaveBeenCalledTimes(3);
            expect(progressCallback).toHaveBeenNthCalledWith(1, {
                processed: 1,
                total: 3,
                percentage: 33,
            });
            expect(progressCallback).toHaveBeenNthCalledWith(2, {
                processed: 2,
                total: 3,
                percentage: 67,
            });
            expect(progressCallback).toHaveBeenNthCalledWith(3, {
                processed: 3,
                total: 3,
                percentage: 100,
            });
        });

        it('should handle large batch processing efficiently', async () => {
            // Arrange
            const texts = new Array(100).fill(0).map((_, i) => `Document ${i}`);
            const batchSize = 25;

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.batchGenerateEmbeddings(texts, batchSize);

            // Assert
            expect(result.embeddings).toHaveLength(100);
            expect(result.embeddings.every(emb => emb.length === 1024)).toBe(true);
            expect(result.totalTokenCount).toBe(500); // 100 texts * 5 tokens each
        });
    });

    describe('parallelBatchGenerateEmbeddings - Parallel Batch Processing', () => {
        it('should process texts in parallel batches', async () => {
            // Arrange
            const texts = new Array(75).fill(0).map((_, i) => `Document ${i}`);
            const batchSize = 25;
            const concurrentBatches = 3;

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.parallelBatchGenerateEmbeddings(
                texts,
                batchSize,
                concurrentBatches
            );

            // Assert
            expect(result.embeddings).toHaveLength(75);
            expect(result.embeddings.every(emb => emb.length === 1024)).toBe(true);
            expect(mockSend).toHaveBeenCalledTimes(75);
        });

        it('should validate all embeddings have 1024 dimensions in parallel processing', async () => {
            // Arrange
            const texts = new Array(30).fill(0).map((_, i) => `Text ${i}`);

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            const result = await generator.parallelBatchGenerateEmbeddings(texts, 10, 2);

            // Assert
            expect(result.embeddings).toHaveLength(30);
            result.embeddings.forEach(embedding => {
                expect(embedding).toHaveLength(1024);
                expect(Array.isArray(embedding)).toBe(true);
            });
        });

        it('should throw error for invalid concurrent batches parameter', async () => {
            // Arrange
            const texts = ['Text 1', 'Text 2'];

            // Act & Assert
            await expect(
                generator.parallelBatchGenerateEmbeddings(texts, 25, 0)
            ).rejects.toThrow('Concurrent batches must be at least 1');

            await expect(
                generator.parallelBatchGenerateEmbeddings(texts, 25, -1)
            ).rejects.toThrow('Concurrent batches must be at least 1');
        });

        it('should call progress callback during parallel processing', async () => {
            // Arrange
            const texts = new Array(10).fill(0).map((_, i) => `Text ${i}`);
            const progressCallback = vi.fn();

            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockSend.mockResolvedValue({
                body: new TextEncoder().encode(JSON.stringify({
                    embedding: mockEmbedding,
                    inputTextTokenCount: 5,
                })),
            });

            // Act
            await generator.parallelBatchGenerateEmbeddings(
                texts,
                5,
                2,
                progressCallback
            );

            // Assert
            expect(progressCallback).toHaveBeenCalled();
            const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0];
            expect(lastCall.processed).toBe(10);
            expect(lastCall.total).toBe(10);
            expect(lastCall.percentage).toBe(100);
        });
    });

    describe('Retry Logic and Error Handling', () => {
        it('should retry on throttling errors', async () => {
            // Arrange
            const inputText = 'Test text';
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());

            const throttlingError = new Error('Throttling');
            (throttlingError as any).name = 'ThrottlingException';

            mockSend
                .mockRejectedValueOnce(throttlingError)
                .mockRejectedValueOnce(throttlingError)
                .mockResolvedValueOnce({
                    body: new TextEncoder().encode(JSON.stringify({
                        embedding: mockEmbedding,
                        inputTextTokenCount: 5,
                    })),
                });

            // Act
            const result = await generator.generateEmbedding(inputText);

            // Assert
            expect(result.embedding).toHaveLength(1024);
            expect(mockSend).toHaveBeenCalledTimes(3);
        });

        it('should throw error after max retry attempts', async () => {
            // Arrange
            const inputText = 'Test text';

            const throttlingError = new Error('Throttling');
            (throttlingError as any).name = 'ThrottlingException';

            mockSend.mockRejectedValue(throttlingError);

            // Act & Assert
            await expect(generator.generateEmbedding(inputText))
                .rejects
                .toThrow('Throttling');

            expect(mockSend).toHaveBeenCalledTimes(3); // Max 3 attempts
        });

        it('should not retry on non-retryable errors', async () => {
            // Arrange
            const inputText = 'Test text';

            const validationError = new Error('Validation failed');
            (validationError as any).name = 'ValidationException';

            mockSend.mockRejectedValueOnce(validationError);

            // Act & Assert
            await expect(generator.generateEmbedding(inputText))
                .rejects
                .toThrow('Validation failed');

            expect(mockSend).toHaveBeenCalledTimes(1); // No retry
        });
    });

    describe('Configuration', () => {
        it('should use default configuration when not provided', () => {
            // Act
            const defaultGenerator = new EmbeddingGenerator();

            // Assert
            expect(BedrockRuntimeClient).toHaveBeenCalled();
        });

        it('should use custom region and modelId from config', () => {
            // Act
            const customGenerator = new EmbeddingGenerator({
                region: 'us-west-2',
                modelId: 'custom-model-id',
            });

            // Assert
            expect(BedrockRuntimeClient).toHaveBeenCalledWith({ region: 'us-west-2' });
        });
    });
});
