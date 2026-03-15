/**
 * Built-in tool executors for the Inline Agent Service.
 *
 * These tools are always available to the agent and wrap existing shared modules:
 * - SearchDocuments: wraps RAGSystem.retrieveContext()
 * - GetDocumentMetadata: queries DynamoDB DocumentMetadata table by documentId
 * - ListUserDocuments: queries DynamoDB DocumentMetadata table by userId (GSI)
 *
 * Requirements: 17.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ToolExecutionResult } from './types.js';

/** Dependencies injected into the built-in tool executor factory */
export interface BuiltinToolDeps {
    /**
     * RAG system retrieveContext function.
     * Accepts (query, options?) and returns { chunks, fromCache, queryEmbedding }.
     */
    retrieveContext: (
        query: string,
        options?: { k?: number },
    ) => Promise<{
        chunks: Array<{
            documentId: string;
            documentName: string;
            pageNumber: number;
            text: string;
            score: number;
        }>;
    }>;
    /** DynamoDB DocumentMetadata table name */
    documentMetadataTable: string;
    /** Current user ID (for ListUserDocuments) */
    userId: string;
    /** Optional pre-configured DynamoDB DocumentClient */
    docClient?: DynamoDBDocumentClient;
}

/** The action group name for built-in document tools */
export const BUILTIN_ACTION_GROUP = 'DocumentTools';

/**
 * Creates a tool executor function for built-in tools.
 * Returns null if the actionGroup/function is not a built-in tool,
 * allowing the caller to fall through to MCP tool execution.
 */
export function createBuiltinToolExecutor(deps: BuiltinToolDeps) {
    const docClient =
        deps.docClient ??
        DynamoDBDocumentClient.from(new DynamoDBClient({}));

    return async (
        actionGroup: string,
        functionName: string,
        parameters: Record<string, string>,
    ): Promise<ToolExecutionResult | null> => {
        if (actionGroup !== BUILTIN_ACTION_GROUP) {
            return null; // Not a built-in tool — let caller route to MCP
        }

        switch (functionName) {
            case 'SearchDocuments':
                return executeSearchDocuments(deps, parameters);
            case 'GetDocumentMetadata':
                return executeGetDocumentMetadata(docClient, deps.documentMetadataTable, parameters);
            case 'ListUserDocuments':
                return executeListUserDocuments(docClient, deps.documentMetadataTable, deps.userId, parameters);
            default:
                return {
                    body: `Unknown built-in tool: ${functionName}`,
                    isError: true,
                };
        }
    };
}

/**
 * SearchDocuments — wraps RAGSystem.retrieveContext()
 */
async function executeSearchDocuments(
    deps: BuiltinToolDeps,
    parameters: Record<string, string>,
): Promise<ToolExecutionResult> {
    const query = parameters.query;
    if (!query) {
        return { body: 'Missing required parameter: query', isError: true };
    }

    const maxResults = parameters.maxResults
        ? Math.min(Math.max(parseInt(parameters.maxResults, 10) || 5, 1), 20)
        : 5;

    try {
        const result = await deps.retrieveContext(query, { k: maxResults });
        const chunks = result.chunks;

        if (chunks.length === 0) {
            return { body: 'No relevant documents found for the given query.' };
        }

        const formatted = chunks.map((chunk, i) => {
            const citation = `[${chunk.documentName}, page ${chunk.pageNumber}]`;
            const score = chunk.score !== undefined ? ` (relevance: ${chunk.score.toFixed(3)})` : '';
            return `--- Result ${i + 1} ${citation}${score} ---\n${chunk.text}`;
        });

        return { body: formatted.join('\n\n') };
    } catch (err: any) {
        console.error('[BuiltinTools] SearchDocuments error:', err);
        return { body: `Search failed: ${err.message ?? String(err)}`, isError: true };
    }
}

/**
 * GetDocumentMetadata — queries DynamoDB DocumentMetadata table by documentId
 */
async function executeGetDocumentMetadata(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    parameters: Record<string, string>,
): Promise<ToolExecutionResult> {
    const documentId = parameters.documentId;
    if (!documentId) {
        return { body: 'Missing required parameter: documentId', isError: true };
    }

    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: tableName,
                Key: {
                    PK: `DOC#${documentId}`,
                    SK: 'METADATA',
                },
            }),
        );

        if (!result.Item) {
            return { body: `No document found with ID: ${documentId}` };
        }

        const item = result.Item;
        const metadata = {
            documentId: item.documentId,
            filename: item.filename,
            uploadedBy: item.uploadedBy,
            uploadedAt: new Date(item.uploadedAt).toISOString(),
            fileSize: item.fileSize,
            pageCount: item.pageCount ?? 0,
            chunkCount: item.chunkCount ?? 0,
            processingStatus: item.processingStatus ?? 'unknown',
            ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
        };

        return { body: JSON.stringify(metadata, null, 2) };
    } catch (err: any) {
        console.error('[BuiltinTools] GetDocumentMetadata error:', err);
        return { body: `Failed to retrieve document metadata: ${err.message ?? String(err)}`, isError: true };
    }
}

/**
 * ListUserDocuments — queries DynamoDB DocumentMetadata table by userId (GSI)
 */
async function executeListUserDocuments(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    userId: string,
    parameters: Record<string, string>,
): Promise<ToolExecutionResult> {
    const limit = parameters.limit
        ? Math.min(Math.max(parseInt(parameters.limit, 10) || 20, 1), 100)
        : 20;

    try {
        const result = await docClient.send(
            new QueryCommand({
                TableName: tableName,
                IndexName: 'uploadedBy-index',
                KeyConditionExpression: 'uploadedBy = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
                Limit: limit,
                ScanIndexForward: false,
            }),
        );

        const items = result.Items ?? [];

        if (items.length === 0) {
            return { body: 'No documents found for the current user.' };
        }

        const documents = items.map((item) => ({
            documentId: item.documentId,
            filename: item.filename,
            uploadedAt: new Date(item.uploadedAt).toISOString(),
            pageCount: item.pageCount ?? 0,
            status: item.processingStatus ?? 'unknown',
        }));

        return { body: JSON.stringify(documents, null, 2) };
    } catch (err: any) {
        console.error('[BuiltinTools] ListUserDocuments error:', err);
        return { body: `Failed to list documents: ${err.message ?? String(err)}`, isError: true };
    }
}
