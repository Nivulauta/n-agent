import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenSearchVectorStore } from './opensearch-client';
import { Embedding, SearchFilters } from './types';

// Mock the OpenSearch client
vi.mock('@opensearch-project/opensearch', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            index: vi.fn(),
            bulk: vi.fn(),
            search: vi.fn(),
            deleteByQuery: vi.fn()
        }))
    };
});

vi.mock('@opensearch-project/opensearch/aws', () => ({
    AwsSigv4Signer: vi.fn(() => ({}))
}));

vi.mock('aws-sdk', () => ({
    EnvironmentCredentials: vi.fn()
}));

describe('OpenSearchVectorStore', () => {
    let vectorStore: OpenSearchVectorStore;
    let mockClient: any;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create vector store instance
        vectorStore = new OpenSearchVectorStore('test-endpoint.us-east-1.es.amazonaws.com');
        mockClient = (vectorStore as any).client;
    });

    describe('indexEmbedding', () => {
        it('should index a single embedding successfully', async () => {
            const embedding: Embedding = {
                chunkId: 'chunk-1',
                vector: new Array(1024).fill(0.1),
                text: 'Test document chunk',
                metadata: {
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    uploadedAt: Date.now(),
                    uploadedBy: 'user-1'
                }
            };

            mockClient.index.mockResolvedValue({ body: { result: 'created' } });

            await vectorStore.indexEmbedding(embedding);

            expect(mockClient.index).toHaveBeenCalledWith({
                index: 'documents',
                id: 'chunk-1',
                body: {
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    text: 'Test document chunk',
                    embedding: embedding.vector,
                    uploadedAt: embedding.metadata.uploadedAt,
                    uploadedBy: 'user-1'
                }
            });
        });

        it('should use "system" as default uploadedBy if not provided', async () => {
            const embedding: Embedding = {
                chunkId: 'chunk-1',
                vector: new Array(1024).fill(0.1),
                text: 'Test document chunk',
                metadata: {
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    uploadedAt: Date.now()
                }
            };

            mockClient.index.mockResolvedValue({ body: { result: 'created' } });

            await vectorStore.indexEmbedding(embedding);

            const callArgs = mockClient.index.mock.calls[0][0];
            expect(callArgs.body.uploadedBy).toBe('system');
        });

        it('should throw error when indexing fails', async () => {
            const embedding: Embedding = {
                chunkId: 'chunk-1',
                vector: new Array(1024).fill(0.1),
                text: 'Test document chunk',
                metadata: {
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    uploadedAt: Date.now()
                }
            };

            mockClient.index.mockRejectedValue(new Error('Connection failed'));

            await expect(vectorStore.indexEmbedding(embedding)).rejects.toThrow(
                'Failed to index embedding chunk-1'
            );
        });
    });

    describe('batchIndexEmbeddings', () => {
        it('should batch index multiple embeddings successfully', async () => {
            const embeddings: Embedding[] = [
                {
                    chunkId: 'chunk-1',
                    vector: new Array(1024).fill(0.1),
                    text: 'First chunk',
                    metadata: {
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        chunkIndex: 0,
                        uploadedAt: Date.now()
                    }
                },
                {
                    chunkId: 'chunk-2',
                    vector: new Array(1024).fill(0.2),
                    text: 'Second chunk',
                    metadata: {
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        chunkIndex: 1,
                        uploadedAt: Date.now()
                    }
                }
            ];

            mockClient.bulk.mockResolvedValue({
                body: {
                    errors: false,
                    items: [
                        { index: { _id: 'chunk-1', result: 'created' } },
                        { index: { _id: 'chunk-2', result: 'created' } }
                    ]
                }
            });

            await vectorStore.batchIndexEmbeddings(embeddings);

            expect(mockClient.bulk).toHaveBeenCalledTimes(1);
            const callArgs = mockClient.bulk.mock.calls[0][0];
            expect(callArgs.body).toHaveLength(4); // 2 embeddings * 2 (action + document)
        });

        it('should handle empty embeddings array', async () => {
            await vectorStore.batchIndexEmbeddings([]);
            expect(mockClient.bulk).not.toHaveBeenCalled();
        });

        it('should throw error when bulk indexing has errors', async () => {
            const embeddings: Embedding[] = [
                {
                    chunkId: 'chunk-1',
                    vector: new Array(1024).fill(0.1),
                    text: 'First chunk',
                    metadata: {
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        chunkIndex: 0,
                        uploadedAt: Date.now()
                    }
                }
            ];

            mockClient.bulk.mockResolvedValue({
                body: {
                    errors: true,
                    items: [
                        { index: { _id: 'chunk-1', error: { type: 'mapper_parsing_exception' } } }
                    ]
                }
            });

            await expect(vectorStore.batchIndexEmbeddings(embeddings)).rejects.toThrow(
                'Bulk indexing failed for 1 documents'
            );
        });

        it('should format bulk request body correctly', async () => {
            const embeddings: Embedding[] = [
                {
                    chunkId: 'chunk-1',
                    vector: new Array(1024).fill(0.1),
                    text: 'Test chunk',
                    metadata: {
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        chunkIndex: 0,
                        uploadedAt: 1234567890,
                        uploadedBy: 'user-1'
                    }
                }
            ];

            mockClient.bulk.mockResolvedValue({
                body: { errors: false, items: [] }
            });

            await vectorStore.batchIndexEmbeddings(embeddings);

            const callArgs = mockClient.bulk.mock.calls[0][0];
            expect(callArgs.body[0]).toEqual({
                index: { _index: 'documents', _id: 'chunk-1' }
            });
            expect(callArgs.body[1]).toEqual({
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentName: 'test.pdf',
                pageNumber: 1,
                chunkIndex: 0,
                text: 'Test chunk',
                embedding: embeddings[0].vector,
                uploadedAt: 1234567890,
                uploadedBy: 'user-1'
            });
        });
    });

    describe('searchSimilar', () => {
        it('should search for similar vectors successfully', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const k = 5;

            mockClient.search.mockResolvedValue({
                body: {
                    hits: {
                        hits: [
                            {
                                _id: 'chunk-1',
                                _score: 0.95,
                                _source: {
                                    chunkId: 'chunk-1',
                                    documentId: 'doc-1',
                                    documentName: 'test.pdf',
                                    pageNumber: 1,
                                    chunkIndex: 0,
                                    text: 'Relevant text',
                                    uploadedAt: 1234567890,
                                    uploadedBy: 'user-1'
                                }
                            }
                        ]
                    }
                }
            });

            const results = await vectorStore.searchSimilar(queryVector, k);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({
                chunkId: 'chunk-1',
                score: 0.95,
                chunk: {
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    text: 'Relevant text',
                    score: 0.95,
                    metadata: {
                        chunkIndex: 0,
                        uploadedAt: 1234567890,
                        uploadedBy: 'user-1'
                    }
                }
            });
        });

        it('should throw error for invalid vector dimensions', async () => {
            const invalidVector = new Array(512).fill(0.5); // Wrong dimension

            await expect(vectorStore.searchSimilar(invalidVector, 5)).rejects.toThrow(
                'Invalid query vector dimension: expected 1024, got 512'
            );
        });

        it('should apply document ID filters', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const filters: SearchFilters = {
                documentIds: ['doc-1', 'doc-2']
            };

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, 5, filters);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.query.knn.filter).toEqual({
                bool: {
                    must: [
                        { terms: { documentId: ['doc-1', 'doc-2'] } }
                    ]
                }
            });
        });

        it('should apply date range filters', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const filters: SearchFilters = {
                dateRange: { start: 1000000000, end: 2000000000 }
            };

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, 5, filters);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.query.knn.filter).toEqual({
                bool: {
                    must: [
                        {
                            range: {
                                uploadedAt: {
                                    gte: 1000000000,
                                    lte: 2000000000
                                }
                            }
                        }
                    ]
                }
            });
        });

        it('should apply metadata filters', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const filters: SearchFilters = {
                metadata: { category: 'technical', status: 'active' }
            };

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, 5, filters);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.query.knn.filter.bool.must).toContainEqual({
                term: { category: 'technical' }
            });
            expect(callArgs.body.query.knn.filter.bool.must).toContainEqual({
                term: { status: 'active' }
            });
        });

        it('should combine multiple filters', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const filters: SearchFilters = {
                documentIds: ['doc-1'],
                dateRange: { start: 1000000000, end: 2000000000 },
                metadata: { category: 'technical' }
            };

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, 5, filters);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.query.knn.filter.bool.must).toHaveLength(3);
        });

        it('should return empty array when no results found', async () => {
            const queryVector = new Array(1024).fill(0.5);

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            const results = await vectorStore.searchSimilar(queryVector, 5);

            expect(results).toEqual([]);
        });
    });

    describe('deleteDocument', () => {
        it('should delete all chunks for a document', async () => {
            mockClient.deleteByQuery.mockResolvedValue({
                body: { deleted: 5 }
            });

            await vectorStore.deleteDocument('doc-1');

            expect(mockClient.deleteByQuery).toHaveBeenCalledWith({
                index: 'documents',
                body: {
                    query: {
                        term: {
                            documentId: 'doc-1'
                        }
                    }
                }
            });
        });

        it('should handle deletion when no documents found', async () => {
            mockClient.deleteByQuery.mockResolvedValue({
                body: { deleted: 0 }
            });

            await expect(vectorStore.deleteDocument('non-existent')).resolves.not.toThrow();
        });

        it('should throw error when deletion fails', async () => {
            mockClient.deleteByQuery.mockRejectedValue(new Error('Connection failed'));

            await expect(vectorStore.deleteDocument('doc-1')).rejects.toThrow(
                'Failed to delete document doc-1'
            );
        });
    });

    describe('constructor', () => {
        it('should use custom index name', () => {
            const customStore = new OpenSearchVectorStore(
                'test-endpoint.us-east-1.es.amazonaws.com',
                'custom-index'
            );

            expect((customStore as any).indexName).toBe('custom-index');
        });

        it('should use default index name', () => {
            expect((vectorStore as any).indexName).toBe('documents');
        });

        it('should initialize with correct endpoint format', () => {
            // Verify the client was created (implicitly tested by other tests)
            expect((vectorStore as any).client).toBeDefined();
            expect((vectorStore as any).indexName).toBe('documents');
        });

        it('should use custom region when provided', () => {
            const customStore = new OpenSearchVectorStore(
                'test-endpoint.eu-west-1.es.amazonaws.com',
                'documents',
                'eu-west-1'
            );

            expect((customStore as any).client).toBeDefined();
        });
    });

    describe('batchIndexEmbeddings - bulk API error handling', () => {
        it('should throw error when bulk API call fails completely', async () => {
            const embeddings: Embedding[] = [
                {
                    chunkId: 'chunk-1',
                    vector: new Array(1024).fill(0.1),
                    text: 'Test',
                    metadata: {
                        documentId: 'doc-1',
                        documentName: 'test.pdf',
                        pageNumber: 1,
                        chunkIndex: 0,
                        uploadedAt: Date.now()
                    }
                }
            ];

            mockClient.bulk.mockRejectedValue(new Error('Network timeout'));

            await expect(vectorStore.batchIndexEmbeddings(embeddings)).rejects.toThrow(
                'Failed to batch index embeddings'
            );
        });
    });

    describe('searchSimilar - advanced filtering', () => {
        it('should handle search with no filters', async () => {
            const queryVector = new Array(1024).fill(0.5);

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, 5);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.query.knn.filter).toBeUndefined();
        });

        it('should handle search errors gracefully', async () => {
            const queryVector = new Array(1024).fill(0.5);

            mockClient.search.mockRejectedValue(new Error('OpenSearch unavailable'));

            await expect(vectorStore.searchSimilar(queryVector, 5)).rejects.toThrow(
                'Failed to search similar vectors'
            );
        });

        it('should return results sorted by score', async () => {
            const queryVector = new Array(1024).fill(0.5);

            mockClient.search.mockResolvedValue({
                body: {
                    hits: {
                        hits: [
                            {
                                _id: 'chunk-1',
                                _score: 0.95,
                                _source: {
                                    chunkId: 'chunk-1',
                                    documentId: 'doc-1',
                                    documentName: 'test.pdf',
                                    pageNumber: 1,
                                    chunkIndex: 0,
                                    text: 'High relevance',
                                    uploadedAt: Date.now(),
                                    uploadedBy: 'user-1'
                                }
                            },
                            {
                                _id: 'chunk-2',
                                _score: 0.85,
                                _source: {
                                    chunkId: 'chunk-2',
                                    documentId: 'doc-1',
                                    documentName: 'test.pdf',
                                    pageNumber: 2,
                                    chunkIndex: 1,
                                    text: 'Medium relevance',
                                    uploadedAt: Date.now(),
                                    uploadedBy: 'user-1'
                                }
                            },
                            {
                                _id: 'chunk-3',
                                _score: 0.75,
                                _source: {
                                    chunkId: 'chunk-3',
                                    documentId: 'doc-2',
                                    documentName: 'other.pdf',
                                    pageNumber: 1,
                                    chunkIndex: 0,
                                    text: 'Lower relevance',
                                    uploadedAt: Date.now(),
                                    uploadedBy: 'user-2'
                                }
                            }
                        ]
                    }
                }
            });

            const results = await vectorStore.searchSimilar(queryVector, 3);

            expect(results).toHaveLength(3);
            expect(results[0].score).toBe(0.95);
            expect(results[1].score).toBe(0.85);
            expect(results[2].score).toBe(0.75);
        });

        it('should respect k parameter for result limit', async () => {
            const queryVector = new Array(1024).fill(0.5);
            const k = 2;

            mockClient.search.mockResolvedValue({
                body: { hits: { hits: [] } }
            });

            await vectorStore.searchSimilar(queryVector, k);

            const callArgs = mockClient.search.mock.calls[0][0];
            expect(callArgs.body.size).toBe(k);
            expect(callArgs.body.query.knn.k).toBe(k);
        });
    });

    describe('indexEmbedding - edge cases', () => {
        it('should handle embeddings with special characters in text', async () => {
            const embedding: Embedding = {
                chunkId: 'chunk-special',
                vector: new Array(1024).fill(0.1),
                text: 'Text with "quotes" and \'apostrophes\' and <tags>',
                metadata: {
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    uploadedAt: Date.now()
                }
            };

            mockClient.index.mockResolvedValue({ body: { result: 'created' } });

            await vectorStore.indexEmbedding(embedding);

            const callArgs = mockClient.index.mock.calls[0][0];
            expect(callArgs.body.text).toBe('Text with "quotes" and \'apostrophes\' and <tags>');
        });

        it('should handle embeddings with very long text', async () => {
            const longText = 'a'.repeat(10000);
            const embedding: Embedding = {
                chunkId: 'chunk-long',
                vector: new Array(1024).fill(0.1),
                text: longText,
                metadata: {
                    documentId: 'doc-1',
                    documentName: 'test.pdf',
                    pageNumber: 1,
                    chunkIndex: 0,
                    uploadedAt: Date.now()
                }
            };

            mockClient.index.mockResolvedValue({ body: { result: 'created' } });

            await vectorStore.indexEmbedding(embedding);

            const callArgs = mockClient.index.mock.calls[0][0];
            expect(callArgs.body.text).toHaveLength(10000);
        });
    });

    describe('deleteDocument - edge cases', () => {
        it('should handle document IDs with special characters', async () => {
            const documentId = 'doc-with-special-chars_123!@#';

            mockClient.deleteByQuery.mockResolvedValue({
                body: { deleted: 3 }
            });

            await vectorStore.deleteDocument(documentId);

            const callArgs = mockClient.deleteByQuery.mock.calls[0][0];
            expect(callArgs.body.query.term.documentId).toBe(documentId);
        });
    });
});

