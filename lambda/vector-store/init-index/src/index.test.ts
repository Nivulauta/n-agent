import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeIndex, handler } from './index';

// Create mock functions that will be shared across tests
const mockExists = vi.fn();
const mockCreate = vi.fn();

// Mock the OpenSearch client
vi.mock('@opensearch-project/opensearch', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            indices: {
                exists: mockExists,
                create: mockCreate
            }
        }))
    };
});

vi.mock('@opensearch-project/opensearch/aws', () => ({
    AwsSigv4Signer: vi.fn(() => ({}))
}));

vi.mock('aws-sdk', () => ({
    EnvironmentCredentials: vi.fn()
}));

describe('OpenSearch Index Initialization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExists.mockReset();
        mockCreate.mockReset();
    });

    describe('initializeIndex', () => {
        it('should create index when it does not exist', async () => {
            // Mock index does not exist
            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockResolvedValue({ body: { acknowledged: true } });

            const result = await initializeIndex('test-endpoint.us-east-1.es.amazonaws.com');

            expect(result.success).toBe(true);
            expect(result.message).toContain('created successfully');
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    index: 'documents',
                    body: expect.objectContaining({
                        mappings: expect.objectContaining({
                            properties: expect.objectContaining({
                                embedding: expect.objectContaining({
                                    type: 'knn_vector',
                                    dimension: 1024,
                                    method: expect.objectContaining({
                                        name: 'hnsw',
                                        space_type: 'cosinesimil',
                                        parameters: expect.objectContaining({
                                            ef_construction: 512,
                                            m: 16
                                        })
                                    })
                                })
                            })
                        }),
                        settings: expect.objectContaining({
                            index: expect.objectContaining({
                                knn: true,
                                'knn.algo_param.ef_search': 512,
                                refresh_interval: '5s'
                            })
                        })
                    })
                })
            );
        });

        it('should return success when index already exists', async () => {
            // Mock index already exists
            mockExists.mockResolvedValue({ body: true });

            const result = await initializeIndex('test-endpoint.us-east-1.es.amazonaws.com');

            expect(result.success).toBe(true);
            expect(result.message).toContain('already exists');
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('should throw error when index creation fails', async () => {
            // Mock index does not exist
            mockExists.mockResolvedValue({ body: false });
            // Mock creation failure
            mockCreate.mockRejectedValue(new Error('Creation failed'));

            await expect(initializeIndex('test-endpoint.us-east-1.es.amazonaws.com')).rejects.toThrow('Creation failed');
        });

        it('should configure correct field types for metadata', async () => {
            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockResolvedValue({ body: { acknowledged: true } });

            await initializeIndex('test-endpoint.us-east-1.es.amazonaws.com');

            const createCall = mockCreate.mock.calls[0][0];
            const properties = createCall.body.mappings.properties;

            // Verify all required metadata fields
            expect(properties.chunkId).toEqual({ type: 'keyword' });
            expect(properties.documentId).toEqual({ type: 'keyword' });
            expect(properties.documentName).toEqual({ type: 'text' });
            expect(properties.pageNumber).toEqual({ type: 'integer' });
            expect(properties.chunkIndex).toEqual({ type: 'integer' });
            expect(properties.text).toEqual({ type: 'text' });
            expect(properties.uploadedAt).toEqual({ type: 'date' });
            expect(properties.uploadedBy).toEqual({ type: 'keyword' });
        });

        it('should configure HNSW parameters correctly', async () => {
            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockResolvedValue({ body: { acknowledged: true } });

            await initializeIndex('test-endpoint.us-east-1.es.amazonaws.com');

            const createCall = mockCreate.mock.calls[0][0];
            const embeddingConfig = createCall.body.mappings.properties.embedding;

            expect(embeddingConfig.method.parameters.ef_construction).toBe(512);
            expect(embeddingConfig.method.parameters.m).toBe(16);
            expect(createCall.body.settings.index['knn.algo_param.ef_search']).toBe(512);
        });

        it('should set refresh_interval to 5s', async () => {
            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockResolvedValue({ body: { acknowledged: true } });

            await initializeIndex('test-endpoint.us-east-1.es.amazonaws.com');

            const createCall = mockCreate.mock.calls[0][0];
            expect(createCall.body.settings.index.refresh_interval).toBe('5s');
        });
    });

    describe('Lambda handler', () => {
        it('should return 500 when OPENSEARCH_ENDPOINT is not set', async () => {
            delete process.env.OPENSEARCH_ENDPOINT;

            const result = await handler({});

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body).error).toContain('OPENSEARCH_ENDPOINT');
        });

        it('should return 200 on successful initialization', async () => {
            process.env.OPENSEARCH_ENDPOINT = 'test-endpoint.us-east-1.es.amazonaws.com';

            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockResolvedValue({ body: { acknowledged: true } });

            const result = await handler({});

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
        });

        it('should return 500 on initialization failure', async () => {
            process.env.OPENSEARCH_ENDPOINT = 'test-endpoint.us-east-1.es.amazonaws.com';

            mockExists.mockResolvedValue({ body: false });
            mockCreate.mockRejectedValue(new Error('Network error'));

            const result = await handler({});

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Failed to create index');
        });
    });
});

