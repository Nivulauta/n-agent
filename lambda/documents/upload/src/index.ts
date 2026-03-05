import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { logDocumentOperation } from '../../../shared/audit-logger/src/audit-logger.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const DOCUMENT_METADATA_TABLE = process.env.DOCUMENT_METADATA_TABLE || 'DocumentMetadata';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || '';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
const PRESIGNED_URL_EXPIRATION = 15 * 60; // 15 minutes in seconds

interface UploadRequest {
    filename: string;
    fileSize: number;
    contentType: string;
}

interface UploadResponse {
    uploadUrl: string;
    documentId: string;
    expiresAt: number;
}

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
 * Document upload endpoint Lambda function
 * POST /documents/upload
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Document upload request received', { requestId: context.awsRequestId });

    try {
        // Extract userId from authorizer context
        const userId = event.requestContext?.authorizer?.userId || 'unknown';

        if (userId === 'unknown') {
            return createResponse(401, { error: 'Unauthorized' });
        }

        // Parse request body
        if (!event.body) {
            return createResponse(400, { error: 'Request body is required' });
        }

        const request: UploadRequest = JSON.parse(event.body);

        // Validate request
        const validationError = validateUploadRequest(request);
        if (validationError) {
            return createResponse(400, { error: validationError });
        }

        // Generate unique document ID
        const documentId = uuidv4();
        const now = Date.now();
        const s3Key = `uploads/${documentId}/${request.filename}`;

        // Generate S3 presigned URL for direct upload
        const uploadUrl = await generatePresignedUrl(s3Key, request.contentType);
        const expiresAt = now + PRESIGNED_URL_EXPIRATION * 1000;

        // Store initial DocumentMetadata record with status=pending
        const metadata: DocumentMetadataRecord = {
            PK: `DOC#${documentId}`,
            SK: 'METADATA',
            documentId,
            filename: request.filename,
            s3Key,
            uploadedBy: userId,
            uploadedAt: now,
            fileSize: request.fileSize,
            pageCount: 0,
            chunkCount: 0,
            processingStatus: 'pending',
        };

        await docClient.send(
            new PutCommand({
                TableName: DOCUMENT_METADATA_TABLE,
                Item: metadata,
            })
        );

        // Log document upload initiation
        await logDocumentOperation({
            operation: 'upload',
            documentId,
            documentName: request.filename,
            userId,
            timestamp: now,
            fileSize: request.fileSize,
            status: 'success',
        });

        const response: UploadResponse = {
            uploadUrl,
            documentId,
            expiresAt,
        };

        console.log('Upload URL generated successfully', { documentId, userId });

        return createResponse(200, response);
    } catch (error) {
        console.error('Upload handler error', { error: error instanceof Error ? error.message : error });
        return createResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Validate upload request
 */
function validateUploadRequest(request: UploadRequest): string | null {
    // Validate filename
    if (!request.filename || typeof request.filename !== 'string' || request.filename.trim() === '') {
        return 'Filename is required and must be a non-empty string';
    }

    // Validate fileSize
    if (!request.fileSize || typeof request.fileSize !== 'number' || request.fileSize <= 0) {
        return 'File size is required and must be a positive number';
    }

    if (request.fileSize > MAX_FILE_SIZE) {
        return `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    // Validate contentType
    if (!request.contentType || typeof request.contentType !== 'string') {
        return 'Content type is required';
    }

    if (request.contentType !== 'application/pdf') {
        return 'Only PDF files are supported (content type must be application/pdf)';
    }

    return null;
}

/**
 * Generate S3 presigned URL for direct upload
 */
async function generatePresignedUrl(s3Key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key,
        ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, {
        expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    return url;
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
