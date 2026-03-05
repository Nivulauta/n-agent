import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { OpenSearchVectorStore } from '../../../shared/vector-store/src/opensearch-client.js';
import { logDocumentOperation } from '../../../shared/audit-logger/src/audit-logger.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const DOCUMENT_METADATA_TABLE = process.env.DOCUMENT_METADATA_TABLE || 'DocumentMetadata';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || '';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || 'documents';

interface DocumentMetadataRecord {
    PK: string;
    SK: string;
    documentId: string;
    filename: string;
    s3Key: string;
    uploadedBy: string;
    uploadedAt: number;
    fileSize: number;
    pageCount: number;
    chunkCount: number;
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
}

/**
 * Document delete endpoint Lambda function
 * DELETE /documents/{documentId}
 * 
 * Validates: Requirements 4.1, 11.2
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Document delete request received', { requestId: context.awsRequestId });

    try {
        // Extract userId from authorizer context
        const userId = event.requestContext?.authorizer?.userId || 'unknown';

        if (userId === 'unknown') {
            return createResponse(401, { error: 'Unauthorized' });
        }

        // Extract documentId from path parameters
        const documentId = event.pathParameters?.documentId;

        if (!documentId) {
            return createResponse(400, { error: 'Document ID is required' });
        }

        // Validate documentId format (UUID)
        if (!isValidUUID(documentId)) {
            return createResponse(400, { error: 'Invalid document ID format' });
        }

        // Retrieve document metadata from DynamoDB
        const metadata = await getDocumentMetadata(documentId);

        if (!metadata) {
            return createResponse(404, { error: 'Document not found' });
        }

        // Verify user has permission to delete (check uploadedBy matches userId)
        if (metadata.uploadedBy !== userId) {
            console.log('Permission denied', { userId, uploadedBy: metadata.uploadedBy });
            return createResponse(403, { error: 'Permission denied: You can only delete your own documents' });
        }

        const now = Date.now();

        // Delete document files from S3 (both uploads/ and processed/ folders)
        await deleteS3Objects(documentId);

        // Delete embeddings from OpenSearch
        await deleteEmbeddings(documentId);

        // Delete DocumentMetadata record from DynamoDB
        await deleteMetadata(documentId);

        // Log deletion to audit log
        await logDocumentOperation({
            operation: 'delete',
            documentId,
            documentName: metadata.filename,
            userId,
            timestamp: now,
            fileSize: metadata.fileSize,
            status: 'success',
        });

        console.log('Document deleted successfully', { documentId, userId });

        return createResponse(200, {
            success: true,
            message: 'Document deleted successfully',
        });
    } catch (error) {
        console.error('Delete handler error', { error: error instanceof Error ? error.message : error });

        // Log failed deletion attempt
        const documentId = event.pathParameters?.documentId || 'unknown';
        const userId = event.requestContext?.authorizer?.userId || 'unknown';

        try {
            await logDocumentOperation({
                operation: 'delete',
                documentId,
                documentName: 'unknown',
                userId,
                timestamp: Date.now(),
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
        } catch (logError) {
            console.error('Failed to log error', { logError });
        }

        return createResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Get document metadata from DynamoDB
 */
async function getDocumentMetadata(documentId: string): Promise<DocumentMetadataRecord | null> {
    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: DOCUMENT_METADATA_TABLE,
                Key: {
                    PK: `DOC#${documentId}`,
                    SK: 'METADATA',
                },
            })
        );

        return result.Item as DocumentMetadataRecord | null;
    } catch (error) {
        console.error('Error retrieving document metadata', { error, documentId });
        throw new Error('Failed to retrieve document metadata');
    }
}

/**
 * Delete document files from S3 (uploads/ and processed/ folders)
 */
async function deleteS3Objects(documentId: string): Promise<void> {
    try {
        // Delete from uploads/ folder
        const uploadPrefix = `uploads/${documentId}/`;
        await deleteS3ObjectsWithPrefix(uploadPrefix);

        // Delete from processed/ folder
        const processedPrefix = `processed/${documentId}/`;
        await deleteS3ObjectsWithPrefix(processedPrefix);

        console.log('S3 objects deleted successfully', { documentId });
    } catch (error) {
        console.error('Error deleting S3 objects', { error, documentId });
        throw new Error('Failed to delete document files from S3');
    }
}

/**
 * Delete all S3 objects with a given prefix
 */
async function deleteS3ObjectsWithPrefix(prefix: string): Promise<void> {
    try {
        // List all objects with the prefix
        const listResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: DOCUMENTS_BUCKET,
                Prefix: prefix,
            })
        );

        // If no objects found, return early
        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('No objects found with prefix', { prefix });
            return;
        }

        // Delete each object
        const deletePromises = listResponse.Contents.map(async (object) => {
            if (object.Key) {
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: DOCUMENTS_BUCKET,
                        Key: object.Key,
                    })
                );
                console.log('Deleted S3 object', { key: object.Key });
            }
        });

        await Promise.all(deletePromises);
    } catch (error) {
        console.error('Error deleting S3 objects with prefix', { error, prefix });
        throw error;
    }
}

/**
 * Delete embeddings from OpenSearch by documentId
 */
async function deleteEmbeddings(documentId: string): Promise<void> {
    try {
        if (!OPENSEARCH_ENDPOINT) {
            console.warn('OpenSearch endpoint not configured, skipping embedding deletion');
            return;
        }

        const vectorStore = new OpenSearchVectorStore(
            OPENSEARCH_ENDPOINT,
            OPENSEARCH_INDEX
        );

        await vectorStore.deleteDocument(documentId);
        console.log('Embeddings deleted successfully', { documentId });
    } catch (error) {
        console.error('Error deleting embeddings', { error, documentId });
        throw new Error('Failed to delete document embeddings from OpenSearch');
    }
}

/**
 * Delete DocumentMetadata record from DynamoDB
 */
async function deleteMetadata(documentId: string): Promise<void> {
    try {
        await docClient.send(
            new DeleteCommand({
                TableName: DOCUMENT_METADATA_TABLE,
                Key: {
                    PK: `DOC#${documentId}`,
                    SK: 'METADATA',
                },
            })
        );

        console.log('Metadata deleted successfully', { documentId });
    } catch (error) {
        console.error('Error deleting metadata', { error, documentId });
        throw new Error('Failed to delete document metadata from DynamoDB');
    }
}

/**
 * Get CORS origin based on environment
 */
function getCorsOrigin(): string {
    // In production, this should be set via environment variable
    // For now, allow localhost for development
    return process.env.CORS_ORIGIN || 'http://localhost:5173';
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCorsOrigin(),
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
            'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify(body),
    };
}
