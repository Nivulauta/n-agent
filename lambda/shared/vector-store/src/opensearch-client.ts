import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { VectorStore, Embedding, SearchFilters, SearchResult, DocumentChunk } from './types.js';

/**
 * OpenSearch client wrapper for vector storage and search operations
 * 
 * This client provides a high-level interface for:
 * - Indexing document embeddings with metadata
 * - Batch indexing for efficient bulk operations
 * - k-NN vector search with filtering capabilities
 * - Document deletion and cleanup
 * 
 * Requirements: 6.3, 7.2
 */
export class OpenSearchVectorStore implements VectorStore {
    private client: Client;
    private indexName: string;

    /**
     * Creates an OpenSearch Vector Store client
     * 
     * @param endpoint - OpenSearch domain endpoint (without https://)
     * @param indexName - Name of the index to use (default: 'documents')
     * @param region - AWS region (default: from AWS_REGION env var or 'us-east-1')
     */
    constructor(endpoint: string, indexName: string = 'documents', region?: string) {
        this.indexName = indexName;
        const awsRegion = region || process.env.AWS_REGION || 'us-east-1';

        this.client = new Client({
            ...AwsSigv4Signer({
                region: awsRegion,
                service: 'es',
                getCredentials: defaultProvider()
            }),
            node: `https://${endpoint}`
        });
    }

    /**
     * Index a single document embedding
     * 
     * @param embedding - Document chunk with vector and metadata
     * @returns Promise that resolves when indexing is complete
     * 
     * Requirements: 6.3
     */
    async indexEmbedding(embedding: Embedding): Promise<void> {
        try {
            await this.client.index({
                index: this.indexName,
                id: embedding.chunkId,
                body: {
                    chunkId: embedding.chunkId,
                    documentId: embedding.metadata.documentId,
                    documentName: embedding.metadata.documentName,
                    pageNumber: embedding.metadata.pageNumber,
                    chunkIndex: embedding.metadata.chunkIndex,
                    text: embedding.text,
                    embedding: embedding.vector,
                    uploadedAt: embedding.metadata.uploadedAt,
                    uploadedBy: embedding.metadata.uploadedBy || 'system'
                }
            });
        } catch (error) {
            console.error('Error indexing embedding:', error);
            throw new Error(`Failed to index embedding ${embedding.chunkId}: ${error}`);
        }
    }

    /**
     * Batch index multiple embeddings using bulk API
     * 
     * This method is more efficient than calling indexEmbedding multiple times
     * as it uses OpenSearch's bulk API to index documents in a single request.
     * 
     * @param embeddings - Array of document chunks with vectors and metadata
     * @returns Promise that resolves when all embeddings are indexed
     * 
     * Requirements: 6.3
     */
    async batchIndexEmbeddings(embeddings: Embedding[]): Promise<void> {
        if (embeddings.length === 0) {
            return;
        }

        try {
            // Build bulk request body
            const body = embeddings.flatMap(embedding => [
                // Action and metadata
                { index: { _index: this.indexName, _id: embedding.chunkId } },
                // Document source
                {
                    chunkId: embedding.chunkId,
                    documentId: embedding.metadata.documentId,
                    documentName: embedding.metadata.documentName,
                    pageNumber: embedding.metadata.pageNumber,
                    chunkIndex: embedding.metadata.chunkIndex,
                    text: embedding.text,
                    embedding: embedding.vector,
                    uploadedAt: embedding.metadata.uploadedAt,
                    uploadedBy: embedding.metadata.uploadedBy || 'system'
                }
            ]);

            const response = await this.client.bulk({
                body
            });

            // Check for errors in bulk response
            if (response.body.errors) {
                const erroredDocuments = response.body.items.filter((item: any) => item.index?.error);
                console.error('Bulk indexing errors:', JSON.stringify(erroredDocuments, null, 2));
                throw new Error(`Bulk indexing failed for ${erroredDocuments.length} documents`);
            }

            console.log(`Successfully indexed ${embeddings.length} embeddings`);
        } catch (error) {
            console.error('Error in batch indexing:', error);
            throw new Error(`Failed to batch index embeddings: ${error}`);
        }
    }

    /**
     * Search for similar vectors using k-NN query
     * 
     * Uses OpenSearch's k-NN plugin with HNSW algorithm for approximate
     * nearest neighbor search. Supports optional filtering by document IDs,
     * date range, and custom metadata.
     * 
     * @param queryVector - Query embedding vector (1024 dimensions)
     * @param k - Number of results to return
     * @param filters - Optional filters for search refinement
     * @returns Array of search results with scores and document chunks
     * 
     * Requirements: 7.2
     */
    async searchSimilar(
        queryVector: number[],
        k: number,
        filters?: SearchFilters
    ): Promise<SearchResult[]> {
        try {
            // Validate query vector dimensions
            if (queryVector.length !== 1024) {
                throw new Error(`Invalid query vector dimension: expected 1024, got ${queryVector.length}`);
            }

            // Build k-NN query
            const knnQuery: any = {
                embedding: {
                    vector: queryVector,
                    k: k
                }
            };

            // Build filter query if filters are provided
            if (filters) {
                const mustClauses: any[] = [];

                // Filter by document IDs
                if (filters.documentIds && filters.documentIds.length > 0) {
                    mustClauses.push({
                        terms: { documentId: filters.documentIds }
                    });
                }

                // Filter by date range
                if (filters.dateRange) {
                    mustClauses.push({
                        range: {
                            uploadedAt: {
                                gte: filters.dateRange.start,
                                lte: filters.dateRange.end
                            }
                        }
                    });
                }

                // Filter by custom metadata
                if (filters.metadata) {
                    for (const [key, value] of Object.entries(filters.metadata)) {
                        mustClauses.push({
                            term: { [key]: value }
                        });
                    }
                }

                if (mustClauses.length > 0) {
                    knnQuery.embedding.filter = {
                        bool: {
                            must: mustClauses
                        }
                    };
                }
            }

            // Execute k-NN search
            const response = await this.client.search({
                index: this.indexName,
                body: {
                    size: k,
                    query: {
                        knn: knnQuery
                    }
                }
            });

            // Parse and return results
            const hits = response.body.hits.hits;
            return hits.map((hit: any) => {
                const source = hit._source;
                return {
                    chunkId: source.chunkId,
                    score: hit._score,
                    chunk: {
                        chunkId: source.chunkId,
                        documentId: source.documentId,
                        documentName: source.documentName,
                        pageNumber: source.pageNumber,
                        text: source.text,
                        score: hit._score,
                        metadata: {
                            chunkIndex: source.chunkIndex,
                            uploadedAt: source.uploadedAt,
                            uploadedBy: source.uploadedBy
                        }
                    }
                };
            });
        } catch (error) {
            console.error('Error searching similar vectors:', error);
            throw new Error(`Failed to search similar vectors: ${error}`);
        }
    }

    /**
     * Delete all chunks for a document
     * 
     * Removes all embeddings associated with a specific document ID.
     * This is useful when a document is deleted or needs to be reprocessed.
     * 
     * @param documentId - ID of the document to delete
     * @returns Promise that resolves when deletion is complete
     * 
     * Requirements: 6.3
     */
    async deleteDocument(documentId: string): Promise<void> {
        try {
            const response = await this.client.deleteByQuery({
                index: this.indexName,
                body: {
                    query: {
                        term: {
                            documentId: documentId
                        }
                    }
                }
            });

            const deletedCount = response.body.deleted || 0;
            console.log(`Deleted ${deletedCount} chunks for document ${documentId}`);
        } catch (error) {
            console.error('Error deleting document:', error);
            throw new Error(`Failed to delete document ${documentId}: ${error}`);
        }
    }
} 