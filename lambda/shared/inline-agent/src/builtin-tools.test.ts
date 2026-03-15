import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBuiltinToolExecutor, BUILTIN_ACTION_GROUP } from './builtin-tools.js';
import type { BuiltinToolDeps } from './builtin-tools.js';

// ── Mock AWS SDK ───────────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn(() => ({ send: mockSend })),
    },
    GetCommand: vi.fn((input: any) => ({ input, type: 'GetCommand' })),
    QueryCommand: vi.fn((input: any) => ({ input, type: 'QueryCommand' })),
}));

// ── Helpers ────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<BuiltinToolDeps> = {}): BuiltinToolDeps {
    return {
        retrieveContext: vi.fn().mockResolvedValue({ chunks: [] }),
        documentMetadataTable: 'TestDocMetadata',
        userId: 'user-1',
        docClient: { send: mockSend } as any,
        ...overrides,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Built-in Tool Executors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Routing ───────────────────────────────────────────────────────

    describe('routing', () => {
        it('returns null for non-builtin action groups', async () => {
            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor('MCPServer', 'search', {});
            expect(result).toBeNull();
        });

        it('returns error for unknown builtin function name', async () => {
            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'UnknownTool', {});
            expect(result).not.toBeNull();
            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Unknown built-in tool');
        });
    });

    // ── SearchDocuments ───────────────────────────────────────────────

    describe('SearchDocuments', () => {
        it('calls retrieveContext with query and returns formatted results', async () => {
            const retrieveContext = vi.fn().mockResolvedValue({
                chunks: [
                    {
                        documentId: 'doc-1',
                        documentName: 'report.pdf',
                        pageNumber: 3,
                        text: 'Revenue increased by 20%',
                        score: 0.95,
                    },
                    {
                        documentId: 'doc-2',
                        documentName: 'summary.pdf',
                        pageNumber: 1,
                        text: 'Q4 results were strong',
                        score: 0.87,
                    },
                ],
            });

            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));
            const result = await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {
                query: 'revenue growth',
                maxResults: '5',
            });

            expect(retrieveContext).toHaveBeenCalledWith('revenue growth', { k: 5 });
            expect(result!.isError).toBeUndefined();
            expect(result!.body).toContain('report.pdf');
            expect(result!.body).toContain('page 3');
            expect(result!.body).toContain('Revenue increased by 20%');
            expect(result!.body).toContain('summary.pdf');
            expect(result!.body).toContain('0.950');
        });

        it('returns error when query parameter is missing', async () => {
            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {});

            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Missing required parameter: query');
        });

        it('returns message when no documents found', async () => {
            const retrieveContext = vi.fn().mockResolvedValue({ chunks: [] });
            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));
            const result = await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {
                query: 'nonexistent topic',
            });

            expect(result!.body).toContain('No relevant documents found');
            expect(result!.isError).toBeUndefined();
        });

        it('clamps maxResults to 20 when above limit', async () => {
            const retrieveContext = vi.fn().mockResolvedValue({ chunks: [] });
            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));

            await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {
                query: 'test',
                maxResults: '50',
            });
            expect(retrieveContext).toHaveBeenCalledWith('test', { k: 20 });
        });

        it('falls back to default 5 when maxResults is 0 (falsy)', async () => {
            const retrieveContext = vi.fn().mockResolvedValue({ chunks: [] });
            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));

            await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {
                query: 'test',
                maxResults: '0',
            });
            // parseInt('0') || 5 evaluates to 5 because 0 is falsy
            expect(retrieveContext).toHaveBeenCalledWith('test', { k: 5 });
        });

        it('defaults maxResults to 5 when not provided', async () => {
            const retrieveContext = vi.fn().mockResolvedValue({ chunks: [] });
            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));

            await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', { query: 'test' });
            expect(retrieveContext).toHaveBeenCalledWith('test', { k: 5 });
        });

        it('handles retrieveContext errors gracefully', async () => {
            const retrieveContext = vi.fn().mockRejectedValue(new Error('OpenSearch down'));
            const executor = createBuiltinToolExecutor(makeDeps({ retrieveContext }));

            const result = await executor(BUILTIN_ACTION_GROUP, 'SearchDocuments', {
                query: 'test',
            });

            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Search failed');
            expect(result!.body).toContain('OpenSearch down');
        });
    });

    // ── GetDocumentMetadata ───────────────────────────────────────────

    describe('GetDocumentMetadata', () => {
        it('returns document metadata from DynamoDB', async () => {
            mockSend.mockResolvedValueOnce({
                Item: {
                    documentId: 'doc-1',
                    filename: 'report.pdf',
                    uploadedBy: 'user-1',
                    uploadedAt: 1700000000000,
                    fileSize: 1024000,
                    pageCount: 10,
                    chunkCount: 25,
                    processingStatus: 'completed',
                },
            });

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {
                documentId: 'doc-1',
            });

            expect(result!.isError).toBeUndefined();
            const parsed = JSON.parse(result!.body);
            expect(parsed.documentId).toBe('doc-1');
            expect(parsed.filename).toBe('report.pdf');
            expect(parsed.pageCount).toBe(10);
            expect(parsed.processingStatus).toBe('completed');
        });

        it('queries DynamoDB with correct key structure', async () => {
            mockSend.mockResolvedValueOnce({ Item: null });

            const executor = createBuiltinToolExecutor(makeDeps());
            await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {
                documentId: 'doc-123',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.input.TableName).toBe('TestDocMetadata');
            expect(command.input.Key).toEqual({
                PK: 'DOC#doc-123',
                SK: 'METADATA',
            });
        });

        it('returns message when document not found', async () => {
            mockSend.mockResolvedValueOnce({ Item: undefined });

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {
                documentId: 'nonexistent',
            });

            expect(result!.body).toContain('No document found');
        });

        it('returns error when documentId is missing', async () => {
            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {});

            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Missing required parameter: documentId');
        });

        it('handles DynamoDB errors gracefully', async () => {
            mockSend.mockRejectedValueOnce(new Error('DynamoDB timeout'));

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {
                documentId: 'doc-1',
            });

            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Failed to retrieve document metadata');
        });

        it('includes errorMessage in output when present', async () => {
            mockSend.mockResolvedValueOnce({
                Item: {
                    documentId: 'doc-1',
                    filename: 'bad.pdf',
                    uploadedBy: 'user-1',
                    uploadedAt: 1700000000000,
                    fileSize: 500,
                    processingStatus: 'failed',
                    errorMessage: 'Corrupt PDF',
                },
            });

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'GetDocumentMetadata', {
                documentId: 'doc-1',
            });

            const parsed = JSON.parse(result!.body);
            expect(parsed.errorMessage).toBe('Corrupt PDF');
        });
    });

    // ── ListUserDocuments ─────────────────────────────────────────────

    describe('ListUserDocuments', () => {
        it('queries DynamoDB GSI by userId and returns documents', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [
                    {
                        documentId: 'doc-1',
                        filename: 'report.pdf',
                        uploadedAt: 1700000000000,
                        pageCount: 10,
                        processingStatus: 'completed',
                    },
                    {
                        documentId: 'doc-2',
                        filename: 'notes.pdf',
                        uploadedAt: 1700001000000,
                        pageCount: 3,
                        processingStatus: 'processing',
                    },
                ],
            });

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', {});

            expect(result!.isError).toBeUndefined();
            const parsed = JSON.parse(result!.body);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].documentId).toBe('doc-1');
            expect(parsed[1].filename).toBe('notes.pdf');
        });

        it('queries with correct GSI and userId', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });

            const executor = createBuiltinToolExecutor(makeDeps({ userId: 'user-42' }));
            await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', {});

            const command = mockSend.mock.calls[0][0];
            expect(command.input.TableName).toBe('TestDocMetadata');
            expect(command.input.IndexName).toBe('uploadedBy-index');
            expect(command.input.ExpressionAttributeValues).toEqual({ ':userId': 'user-42' });
        });

        it('returns message when no documents found', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', {});

            expect(result!.body).toContain('No documents found');
        });

        it('clamps limit to 100 when above max', async () => {
            mockSend.mockResolvedValue({ Items: [] });

            const executor = createBuiltinToolExecutor(makeDeps());

            await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', { limit: '200' });
            expect(mockSend.mock.calls[0][0].input.Limit).toBe(100);
        });

        it('falls back to default 20 when limit is 0 (falsy)', async () => {
            mockSend.mockResolvedValue({ Items: [] });

            const executor = createBuiltinToolExecutor(makeDeps());

            await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', { limit: '0' });
            // parseInt('0') || 20 evaluates to 20 because 0 is falsy
            expect(mockSend.mock.calls[0][0].input.Limit).toBe(20);
        });

        it('defaults limit to 20', async () => {
            mockSend.mockResolvedValueOnce({ Items: [] });

            const executor = createBuiltinToolExecutor(makeDeps());
            await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', {});

            expect(mockSend.mock.calls[0][0].input.Limit).toBe(20);
        });

        it('handles DynamoDB errors gracefully', async () => {
            mockSend.mockRejectedValueOnce(new Error('Access denied'));

            const executor = createBuiltinToolExecutor(makeDeps());
            const result = await executor(BUILTIN_ACTION_GROUP, 'ListUserDocuments', {});

            expect(result!.isError).toBe(true);
            expect(result!.body).toContain('Failed to list documents');
        });
    });
});
