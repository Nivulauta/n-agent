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
    private metricsCallback?: (latency: number, resultCount: number, scores?: { avg?: number; max?: number; min?: number }) => Promise<void>;

    /**
     * Creates an OpenSearch Vector Store client
     * 
     * @param endpoint - OpenSearch domain endpoint (without https://)
     * @param indexName - Name of the index to use (default: 'documents')
     * @param region - AWS region (default: from AWS_REGION env var or 'us-east-1')
     * @param metricsCallback - Optional callback for emitting metrics
     */
    constructor(
        endpoint: string,
        indexName: string = 'documents',
        region?: string,
        metricsCallback?: (latency: number, resultCount: number, scores?: { avg?: number; max?: number; min?: number }) => Promise<void>
    ) {
        this.indexName = indexName;
        this.metricsCallback = metricsCallback;
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

            // Process in smaller chunks to avoid overwhelming OpenSearch
            const BATCH_SIZE = 25;
            const MAX_RETRIES = 3;

            for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
                const batch = embeddings.slice(i, i + BATCH_SIZE);
                let lastError: Error | undefined;

                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        if (attempt > 0) {
                            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
                            console.log(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }

                        const body = batch.flatMap(embedding => [
                            { index: { _index: this.indexName, _id: embedding.chunkId } },
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

                        const response = await this.client.bulk({ body });

                        if (response.body.errors) {
                            const erroredDocuments = response.body.items.filter((item: any) => item.index?.error);
                            // Check if errors are retryable (429 Too Many Requests)
                            const retryable = erroredDocuments.some((item: any) => item.index?.status === 429);
                            if (retryable && attempt < MAX_RETRIES) {
                                lastError = new Error(`Bulk indexing rate limited for ${erroredDocuments.length} documents`);
                                continue;
                            }
                            console.error('Bulk indexing errors:', JSON.stringify(erroredDocuments, null, 2));
                            throw new Error(`Bulk indexing failed for ${erroredDocuments.length} documents`);
                        }

                        lastError = undefined;
                        break; // Success, move to next batch
                    } catch (error) {
                        lastError = error instanceof Error ? error : new Error(String(error));
                        const isRetryable = lastError.message.includes('Too Many Requests') ||
                            lastError.message.includes('429') ||
                            lastError.message.includes('rate limited');
                        if (!isRetryable || attempt >= MAX_RETRIES) {
                            throw new Error(`Failed to batch index embeddings: ${lastError}`);
                        }
                    }
                }

                if (lastError) {
                    throw new Error(`Failed to batch index embeddings after ${MAX_RETRIES} retries: ${lastError}`);
                }

                console.log(`Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(embeddings.length / BATCH_SIZE)} (${batch.length} embeddings)`);
            }

            console.log(`Successfully indexed ${embeddings.length} embeddings`);
        }


    /**
     * Search for similar vectors using k-NN query
     * 
     * Uses OpenSearch's k-NN plugin with HNSW algorithm for approximate
     * nearest neighbor search. Supports optional filtering by document IDs,
     * date range, and custom metadata.
     * 
     * Emits search latency metrics to CloudWatch for monitoring performance.
     * 
     * @param queryVector - Query embedding vector (1024 dimensions)
     * @param k - Number of results to return
     * @param filters - Optional filters for search refinement
     * @returns Array of search results with scores and document chunks
     * 
     * Requirements: 7.2, 15.1
     */
    async searchSimilar(
        queryVector: number[],
        k: number,
        filters?: SearchFilters
    ): Promise<SearchResult[]> {
        const startTime = Date.now();

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
            const results = hits.map((hit: any) => {
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

            // Calculate search latency
            const latency = Date.now() - startTime;

            // Calculate score statistics
            const scores = results.map((r: SearchResult) => r.score);
            const averageScore = scores.length > 0
                ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length
                : undefined;
            const maxScore = scores.length > 0 ? Math.max(...scores) : undefined;
            const minScore = scores.length > 0 ? Math.min(...scores) : undefined;

            // Emit search latency metric (Requirement 15.1)
            if (this.metricsCallback) {
                try {
                    await this.metricsCallback(latency, results.length, {
                        avg: averageScore,
                        max: maxScore,
                        min: minScore,
                    });
                } catch (metricsError) {
                    // Log but don't fail the search if metrics emission fails
                    console.error('Failed to emit search latency metric:', metricsError);
                }
            }

            return results;
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