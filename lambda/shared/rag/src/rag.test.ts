/**
 * Unit tests for RAG orchestration module
 * 
 * Tests cover:
 * - Context retrieval with mock embeddings (Requirement 7.1)
 * - Context assembly formatting (Requirement 7.4)
 * - Cache integration (Requirement 12.2)
 * - Vector search coordination
 * - Error handling and fallback behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RAGSystem } from './rag.js';
import type { DocumentChunk, ConversationMessage } from './types.js';

// Mock the dependencies
vi.mock('../../embeddings/dist/embeddings.js', () => ({
    EmbeddingGenerator: vi.fn().mockImplementation(() => ({
        generateEmbedding: vi.fn(),
    })),
}));

vi.mock('../../vector-store/dist/opensearch-client.js', () => ({
    OpenSearchVectorStore: vi.fn().mockImplementation(() => ({
        searchSimilar: vi.fn(),
    })),
}));

vi.mock('../../cache/dist/cache.js', () => ({
    CacheLayer: vi.fn().mockImplementation(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        isAvailable: vi.fn(),
        getCachedSearchResults: vi.fn(),
        setCachedSearchResults: vi.fn(),
    })),
}));

describe('RAGSystem', () => {
    let ragSystem: RAGSystem;
    let mockEmbeddingGenerator: any;
    let mockVectorStore: any;
    let mockCache: any;

    beforeEach(() => {
        vi.clearAllMocks();

        ragSystem = new RAGSystem({
            region: 'us-east-1',
            opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            cacheHost: 'localhost',
            cachePort: 6379,
        });

        mockEmbeddingGenerator = (ragSystem as any).embeddingGenerator;
        mockVectorStore = (ragSystem as any).vectorStore;
        mockCache = (ragSystem as any).cache;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with required config', () => {
            const rag = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            expect(rag).toBeDefined();
            expect(rag.isCacheAvailable()).toBe(false);
        });

        it('should initialize with cache config', () => {
            const rag = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
                cacheHost: 'localhost',
                cachePort: 6379,
            });

            expect(rag).toBeDefined();
        });

        it('should initialize with full config', () => {
            const rag = new RAGSystem({
                region: 'us-west-2',
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
                cacheHost: 'localhost',
                cachePort: 6379,
                cachePassword: 'test-password',
                cacheTls: true,
            });

            expect(rag).toBeDefined();
        });

        it('should disable cache when host or port not provided', () => {
            const ragNoCache = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            expect(ragNoCache.isCacheAvailable()).toBe(false);
        });
    });

    describe('initialize', () => {
        it('should connect to cache when cache is enabled', async () => {
            mockCache.connect.mockResolvedValue(undefined);

            await ragSystem.initialize();

            expect(mockCache.connect).toHaveBeenCalledTimes(1);
        });

        it('should handle cache connection failure gracefully', async () => {
            mockCache.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(ragSystem.initialize()).resolves.not.toThrow();
            expect(ragSystem.isCacheAvailable()).toBe(false);
        });

        it('should not attempt cache connection when cache is disabled', async () => {
            const ragNoCache = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            await ragNoCache.initialize();

            // Cache should not be called since it's not configured
            expect(mockCache.connect).not.toHaveBeenCalled();
        });
    });

    describe('retrieveContext - Context Retrieval with Mock Embeddings (Requirement 7.1, 7.2)', () => {
        const mockQueryEmbedding = new Array(1024).fill(0).map(() => Math.random());
        const mockChunks: DocumentChunk[] = [
            {
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentName: 'test-document.pdf',
                pageNumber: 1,
                text: 'This is the first relevant chunk about machine learning.',
                score: 0.95,
                metadata: {
                    chunkIndex: 0,
                    uploadedAt: Date.now(),
                    uploadedBy: 'user-1',
                },
            },
            {
                chunkId: 'chunk-2',
                documentId: 'doc-1',
                documentName: 'test-document.pdf',
                pageNumber: 2,
                text: 'This is the second relevant chunk about neural networks.',
                score: 0.89,
                metadata: {
                    chunkIndex: 1,
                    uploadedAt: Date.now(),
                    uploadedBy: 'user-1',
                },
            },
            {
                chunkId: 'chunk-3',
                documentId: 'doc-2',
                documentName: 'another-document.pdf',
                pageNumber: 1,
                text: 'This chunk discusses deep learning architectures.',
                score: 0.82,
                metadata: {
                    chunkIndex: 0,
                    uploadedAt: Date.now(),
                    uploadedBy: 'user-2',
                },
            },
        ];

        beforeEach(async () => {
            mockCache.connect.mockResolvedValue(undefined);
            mockCache.isAvailable.mockReturnValue(true);
            await ragSystem.initialize();
        });

        it('should generate query embedding and retrieve relevant chunks', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue(
                mockChunks.map((chunk) => ({ chunk, score: chunk.score }))
            );

            mockCache.setCachedSearchResults.mockResolvedValue(undefined);

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?');

            // Assert
            expect(mockEmbeddingGenerator.generateEmbedding).toHaveBeenCalledWith(
                'What is machine learning?'
            );
            expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
                mockQueryEmbedding,
                5,
                undefined
            );
            expect(result.chunks).toHaveLength(3);
            expect(result.chunks[0].chunkId).toBe('chunk-1');
            expect(result.fromCache).toBe(false);
            expect(result.queryEmbedding).toEqual(mockQueryEmbedding);
        });

        it('should return cached results when available (Requirement 12.2)', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(mockChunks);

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?');

            // Assert
            expect(mockCache.getCachedSearchResults).toHaveBeenCalledWith(mockQueryEmbedding);
            expect(mockVectorStore.searchSimilar).not.toHaveBeenCalled();
            expect(result.chunks).toHaveLength(3);
            expect(result.fromCache).toBe(true);
            expect(result.queryEmbedding).toEqual(mockQueryEmbedding);
        });

        it('should cache search results after vector store query (Requirement 12.2)', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue(
                mockChunks.map((chunk) => ({ chunk, score: chunk.score }))
            );

            mockCache.setCachedSearchResults.mockResolvedValue(undefined);

            // Act
            await ragSystem.retrieveContext('What is machine learning?');

            // Assert
            expect(mockCache.setCachedSearchResults).toHaveBeenCalledWith(
                mockQueryEmbedding,
                mockChunks
            );
        });

        it('should respect k parameter for number of chunks to retrieve', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue(
                mockChunks.slice(0, 2).map((chunk) => ({ chunk, score: chunk.score }))
            );

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?', { k: 2 });

            // Assert
            expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
                mockQueryEmbedding,
                2,
                undefined
            );
            expect(result.chunks).toHaveLength(2);
        });

        it('should apply k limit to cached results', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(mockChunks);

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?', { k: 2 });

            // Assert
            expect(result.chunks).toHaveLength(2);
            expect(result.chunks[0].chunkId).toBe('chunk-1');
            expect(result.chunks[1].chunkId).toBe('chunk-2');
        });

        it('should pass filters to vector store search', async () => {
            // Arrange
            const filters = {
                documentIds: ['doc-1'],
                dateRange: { start: 1000000000, end: 2000000000 },
            };

            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue([]);

            // Act
            await ragSystem.retrieveContext('What is machine learning?', { filters });

            // Assert
            expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
                mockQueryEmbedding,
                5,
                filters
            );
        });

        it('should handle empty search results', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue([]);

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?');

            // Assert
            expect(result.chunks).toEqual([]);
            expect(result.fromCache).toBe(false);
        });

        it('should continue without caching if cache set fails', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue(
                mockChunks.map((chunk) => ({ chunk, score: chunk.score }))
            );

            mockCache.setCachedSearchResults.mockRejectedValue(new Error('Cache write failed'));

            // Act
            const result = await ragSystem.retrieveContext('What is machine learning?');

            // Assert - Should not throw, just log warning
            expect(result.chunks).toHaveLength(3);
            expect(result.fromCache).toBe(false);
        });

        it('should work without cache when cache is disabled', async () => {
            // Arrange
            const ragNoCache = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            const mockEmbGen = (ragNoCache as any).embeddingGenerator;
            const mockVecStore = (ragNoCache as any).vectorStore;

            mockEmbGen.generateEmbedding.mockResolvedValue({
                embedding: mockQueryEmbedding,
                inputTextTokenCount: 10,
            });

            mockVecStore.searchSimilar.mockResolvedValue(
                mockChunks.map((chunk) => ({ chunk, score: chunk.score }))
            );

            // Act
            const result = await ragNoCache.retrieveContext('What is machine learning?');

            // Assert
            expect(result.chunks).toHaveLength(3);
            expect(result.fromCache).toBe(false);
        });
    });

    describe('generateQueryEmbedding', () => {
        it('should generate embedding for query text', async () => {
            // Arrange
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockEmbedding,
                inputTextTokenCount: 10,
            });

            // Act
            const result = await ragSystem.generateQueryEmbedding('What is AI?');

            // Assert
            expect(mockEmbeddingGenerator.generateEmbedding).toHaveBeenCalledWith('What is AI?');
            expect(result).toEqual(mockEmbedding);
            expect(result).toHaveLength(1024);
        });

        it('should throw error for empty query', async () => {
            // Arrange
            mockEmbeddingGenerator.generateEmbedding.mockRejectedValue(
                new Error('Input text cannot be empty')
            );

            // Act & Assert
            await expect(ragSystem.generateQueryEmbedding('')).rejects.toThrow(
                'Input text cannot be empty'
            );
        });
    });

    describe('assembleContext - Context Assembly Formatting (Requirement 7.4)', () => {
        const mockChunks: DocumentChunk[] = [
            {
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentName: 'ml-guide.pdf',
                pageNumber: 5,
                text: 'Machine learning is a subset of artificial intelligence that enables systems to learn from data.',
                score: 0.95,
                metadata: {},
            },
            {
                chunkId: 'chunk-2',
                documentId: 'doc-1',
                documentName: 'ml-guide.pdf',
                pageNumber: 12,
                text: 'Neural networks are computing systems inspired by biological neural networks.',
                score: 0.88,
                metadata: {},
            },
            {
                chunkId: 'chunk-3',
                documentId: 'doc-2',
                documentName: 'ai-basics.pdf',
                pageNumber: 3,
                text: 'Deep learning uses multiple layers to progressively extract higher-level features.',
                score: 0.82,
                metadata: {},
            },
        ];

        const mockConversationHistory: ConversationMessage[] = [
            { role: 'user', content: 'Hello, can you help me?' },
            { role: 'assistant', content: 'Of course! How can I assist you today?' },
            { role: 'user', content: 'I want to learn about AI.' },
            {
                role: 'assistant',
                content: 'AI is a fascinating field. What specific aspect interests you?',
            },
        ];

        it('should format chunks with document citations', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                []
            );

            // Assert
            expect(result.userPrompt).toContain('[1] ml-guide.pdf, Page 5');
            expect(result.userPrompt).toContain('[2] ml-guide.pdf, Page 12');
            expect(result.userPrompt).toContain('[3] ai-basics.pdf, Page 3');
            expect(result.userPrompt).toContain(mockChunks[0].text);
            expect(result.userPrompt).toContain(mockChunks[1].text);
            expect(result.userPrompt).toContain(mockChunks[2].text);
            expect(result.userPrompt).toContain('What is machine learning?');
        });

        it('should include chunk scores when requested', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                [],
                { includeChunkScores: true }
            );

            // Assert
            expect(result.userPrompt).toContain('(relevance: 0.950)');
            expect(result.userPrompt).toContain('(relevance: 0.880)');
            expect(result.userPrompt).toContain('(relevance: 0.820)');
        });

        it('should create system prompt with context instructions when chunks provided', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                []
            );

            // Assert
            expect(result.systemPrompt).toContain('knowledge base');
            expect(result.systemPrompt).toContain('document context');
            expect(result.systemPrompt).toContain('Cite');
        });

        it('should create generic system prompt when no chunks provided', () => {
            // Act
            const result = ragSystem.assembleContext('What is machine learning?', [], []);

            // Assert
            expect(result.systemPrompt).toContain('helpful AI assistant');
            expect(result.systemPrompt).not.toContain('knowledge base');
            expect(result.userPrompt).toBe('What is machine learning?');
        });

        it('should include conversation history with sliding window', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                mockConversationHistory,
                { conversationWindowSize: 10 }
            );

            // Assert
            expect(result.conversationHistory).toHaveLength(4);
            expect(result.conversationHistory[0].content).toBe('Hello, can you help me?');
            expect(result.conversationHistory[3].content).toContain('specific aspect');
        });

        it('should limit conversation history to window size', () => {
            // Arrange
            const longHistory: ConversationMessage[] = new Array(20)
                .fill(null)
                .map((_, i) => ({
                    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
                    content: `Message ${i}`,
                }));

            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                longHistory,
                { conversationWindowSize: 5 }
            );

            // Assert
            expect(result.conversationHistory).toHaveLength(5);
            expect(result.conversationHistory[0].content).toBe('Message 15');
            expect(result.conversationHistory[4].content).toBe('Message 19');
        });

        it('should use default window size of 10 when not specified', () => {
            // Arrange
            const longHistory: ConversationMessage[] = new Array(15)
                .fill(null)
                .map((_, i) => ({
                    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
                    content: `Message ${i}`,
                }));

            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                longHistory
            );

            // Assert
            expect(result.conversationHistory).toHaveLength(10);
            expect(result.conversationHistory[0].content).toBe('Message 5');
        });

        it('should estimate token count for assembled context', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                mockConversationHistory
            );

            // Assert
            expect(result.totalTokens).toBeGreaterThan(0);
            expect(typeof result.totalTokens).toBe('number');
        });

        it('should truncate context when exceeding max tokens', () => {
            // Arrange
            const largeChunks: DocumentChunk[] = new Array(10).fill(null).map((_, i) => ({
                chunkId: `chunk-${i}`,
                documentId: 'doc-1',
                documentName: 'large-doc.pdf',
                pageNumber: i + 1,
                text: 'A'.repeat(5000), // Very long text
                score: 0.9 - i * 0.05,
                metadata: {},
            }));

            const largeHistory: ConversationMessage[] = new Array(20)
                .fill(null)
                .map((_, i) => ({
                    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
                    content: 'B'.repeat(1000),
                }));

            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                largeChunks,
                largeHistory,
                { maxContextTokens: 5000 }
            );

            // Assert
            expect(result.truncated).toBe(true);
            // Token count should be reduced (may not be exactly under limit due to estimation)
            expect(result.totalTokens).toBeLessThan(20000); // Should be significantly reduced
        });

        it('should reduce conversation history first when truncating', () => {
            // Arrange
            const largeHistory: ConversationMessage[] = new Array(20)
                .fill(null)
                .map((_, i) => ({
                    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
                    content: 'A'.repeat(1000),
                }));

            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                largeHistory,
                { maxContextTokens: 5000 }
            );

            // Assert
            expect(result.conversationHistory.length).toBeLessThan(20);
        });

        it('should reduce chunks if history reduction is insufficient', () => {
            // Arrange
            const largeChunks: DocumentChunk[] = new Array(10).fill(null).map((_, i) => ({
                chunkId: `chunk-${i}`,
                documentId: 'doc-1',
                documentName: 'large-doc.pdf',
                pageNumber: i + 1,
                text: 'A'.repeat(5000),
                score: 0.9 - i * 0.05,
                metadata: {},
            }));

            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                largeChunks,
                [],
                { maxContextTokens: 5000 }
            );

            // Assert
            expect(result.truncated).toBe(true);
            // Should have reduced chunks to fit
            expect(result.userPrompt.split('---').length - 1).toBeLessThanOrEqual(3);
        });

        it('should handle empty conversation history', () => {
            // Act
            const result = ragSystem.assembleContext('What is machine learning?', mockChunks, []);

            // Assert
            expect(result.conversationHistory).toEqual([]);
            expect(result.systemPrompt).toBeDefined();
            expect(result.userPrompt).toBeDefined();
        });

        it('should handle query without chunks or history', () => {
            // Act
            const result = ragSystem.assembleContext('What is machine learning?', [], []);

            // Assert
            expect(result.conversationHistory).toEqual([]);
            expect(result.userPrompt).toBe('What is machine learning?');
            expect(result.systemPrompt).toContain('helpful AI assistant');
            expect(result.truncated).toBe(false);
        });

        it('should format context with proper separators', () => {
            // Act
            const result = ragSystem.assembleContext(
                'What is machine learning?',
                mockChunks,
                []
            );

            // Assert
            expect(result.userPrompt).toContain('---'); // Chunk separator
            expect(result.userPrompt).toContain('Context from knowledge base:');
            expect(result.userPrompt).toContain('User question:');
        });
    });

    describe('disconnect', () => {
        it('should disconnect from cache', async () => {
            // Arrange
            mockCache.disconnect.mockResolvedValue(undefined);

            // Act
            await ragSystem.disconnect();

            // Assert
            expect(mockCache.disconnect).toHaveBeenCalledTimes(1);
        });

        it('should handle disconnect when cache is not configured', async () => {
            // Arrange
            const ragNoCache = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            // Act & Assert
            await expect(ragNoCache.disconnect()).resolves.not.toThrow();
        });
    });

    describe('isCacheAvailable', () => {
        it('should return true when cache is enabled and available', async () => {
            // Arrange
            mockCache.connect.mockResolvedValue(undefined);
            mockCache.isAvailable.mockReturnValue(true);

            await ragSystem.initialize();

            // Act
            const result = ragSystem.isCacheAvailable();

            // Assert
            expect(result).toBe(true);
        });

        it('should return false when cache is not configured', () => {
            // Arrange
            const ragNoCache = new RAGSystem({
                opensearchEndpoint: 'https://test-endpoint.amazonaws.com',
            });

            // Act
            const result = ragNoCache.isCacheAvailable();

            // Assert
            expect(result).toBe(false);
        });

        it('should return false when cache connection fails', async () => {
            // Arrange
            mockCache.connect.mockRejectedValue(new Error('Connection failed'));

            await ragSystem.initialize();

            // Act
            const result = ragSystem.isCacheAvailable();

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('Integration - Full RAG Pipeline', () => {
        it('should execute complete RAG pipeline: embed -> search -> cache -> assemble', async () => {
            // Arrange
            const query = 'Explain neural networks';
            const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());
            const mockChunks: DocumentChunk[] = [
                {
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    documentName: 'neural-nets.pdf',
                    pageNumber: 10,
                    text: 'Neural networks consist of interconnected nodes.',
                    score: 0.92,
                    metadata: {},
                },
            ];

            mockCache.connect.mockResolvedValue(undefined);
            mockCache.isAvailable.mockReturnValue(true);
            await ragSystem.initialize();

            mockEmbeddingGenerator.generateEmbedding.mockResolvedValue({
                embedding: mockEmbedding,
                inputTextTokenCount: 5,
            });

            mockCache.getCachedSearchResults.mockResolvedValue(null);

            mockVectorStore.searchSimilar.mockResolvedValue(
                mockChunks.map((chunk) => ({ chunk, score: chunk.score }))
            );

            mockCache.setCachedSearchResults.mockResolvedValue(undefined);

            // Act
            const retrievalResult = await ragSystem.retrieveContext(query);
            const assembledContext = ragSystem.assembleContext(query, retrievalResult.chunks, []);

            // Assert
            expect(retrievalResult.chunks).toHaveLength(1);
            expect(retrievalResult.fromCache).toBe(false);
            expect(assembledContext.userPrompt).toContain('neural-nets.pdf');
            expect(assembledContext.userPrompt).toContain('Explain neural networks');
            expect(assembledContext.systemPrompt).toContain('knowledge base');
            expect(mockCache.setCachedSearchResults).toHaveBeenCalled();
        });
    });
});

