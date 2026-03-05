import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DOCUMENT_METADATA_TABLE = process.env.DOCUMENT_METADATA_TABLE || 'DocumentMetadata';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface DocumentListItem {
    documentId: string;
    filename: string;
    uploadedAt: number;
    pageCount: number;
    status: string;
}

interface DocumentListResponse {
    documents: DocumentListItem[];
    nextToken?: string;
}

/**
 * Document list endpoint Lambda function
 * GET /documents
 */
export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('Document list request received', { requestId: context.awsRequestId });

    try {
        // Extract userId from authorizer context
        const userId = event.requestContext?.authorizer?.userId || 'unknown';

        if (userId === 'unknown') {
            return createResponse(401, { error: 'Unauthorized' });
        }

        // Parse query parameters
        const limit = parseLimit(event.queryStringParameters?.limit);
        const nextToken = event.queryStringParameters?.nextToken;

        // Query DocumentMetadata table by uploadedBy (GSI)
        const documents = await queryDocumentsByUser(userId, limit, nextToken);

        console.log('Documents retrieved successfully', {
            userId,
            count: documents.documents.length,
            hasMore: !!documents.nextToken
        });

        return createResponse(200, documents);
    } catch (error) {
        console.error('Document list handler error', {
            error: error instanceof Error ? error.message : error
        });
        return createResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Query documents by user using GSI
 */
async function queryDocumentsByUser(
    userId: string,
    limit: number,
    nextToken?: string
): Promise<DocumentListResponse> {
    const params: any = {
        TableName: DOCUMENT_METADATA_TABLE,
        IndexName: 'uploadedBy-index',
        KeyConditionExpression: 'uploadedBy = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
        Limit: limit,
        ScanIndexForward: false, // Sort by uploadedAt descending (most recent first)
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
        } catch (error) {
            console.error('Invalid nextToken', { error });
            throw new Error('Invalid pagination token');
        }
    }

    const result = await docClient.send(new QueryCommand(params));

    // Map DynamoDB items to response format
    const documents: DocumentListItem[] = (result.Items || []).map(item => ({
        documentId: item.documentId,
        filename: item.filename,
        uploadedAt: item.uploadedAt,
        pageCount: item.pageCount || 0,
        status: item.processingStatus || 'unknown',
    }));

    // Encode LastEvaluatedKey as nextToken
    const response: DocumentListResponse = {
        documents,
    };

    if (result.LastEvaluatedKey) {
        response.nextToken = Buffer.from(
            JSON.stringify(result.LastEvaluatedKey)
        ).toString('base64');
    }

    return response;
}

/**
 * Parse and validate limit parameter
 */
function parseLimit(limitParam?: string): number {
    if (!limitParam) {
        return DEFAULT_LIMIT;
    }

    const limit = parseInt(limitParam, 10);

    if (isNaN(limit) || limit <= 0) {
        return DEFAULT_LIMIT;
    }

    return Math.min(limit, MAX_LIMIT);
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
