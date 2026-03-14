import { describe, it, expect, beforeEach } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

describe('Document Delete Handler', () => {
    beforeEach(() => {
        dynamoMock.reset();
        s3Mock.reset();
        process.env.DOCUMENT_METADATA_TABLE = 'DocumentMetadata';
        process.env.DOCUMENTS_BUCKET = 'test-bucket';
        process.env.OPENSEARCH_ENDPOINT = '';
        process.env.OPENSEARCH_INDEX = 'documents';
    });

    const createEvent = (documentId: string, userId: string): APIGatewayProxyEvent => ({
        httpMethod: 'DELETE',
        path: `/documents/${documentId}`,
        pathParameters: { documentId },
        requestContext: {
            authorizer: { userId },
        } as any,
        headers: {},
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        queryStringParameters: null,
        resource: '',
        stageVariables: null,
    });

    const createContext = (): Context => ({
        awsRequestId: 'test-request-id',
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test-function',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        logGroupName: '/aws/lambda/test',
        logStreamName: 'test-stream',
        memoryLimitInMB: '128',
        getRemainingTimeInMillis: () => 30000,
        done: () => { },
        fail: () => { },
        succeed: () => { },
    });

    it('should return 400 if documentId is missing', async () => {
        const { handler } = await import('./index.js');

        const event = createEvent('', 'user-123');
        event.pathParameters = null;
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Document ID is required' });
    });

    it('should return 400 if documentId is not a valid UUID', async () => {
        const { handler } = await import('./index.js');

        const event = createEvent('invalid-id', 'user-123');
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Invalid document ID format' });
    });

    it('should return 401 if user is not authenticated', async () => {
        const { handler } = await import('./index.js');

        const event = createEvent('550e8400-e29b-41d4-a716-446655440000', 'unknown');
        event.requestContext.authorizer = undefined;
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
    });

    it('should return 404 if document does not exist', async () => {
        const { handler } = await import('./index.js');

        const documentId = '550e8400-e29b-41d4-a716-446655440000';
        const userId = 'user-123';

        dynamoMock.on(GetCommand).resolves({ Item: undefined });

        const event = createEvent(documentId, userId);
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body)).toEqual({ error: 'Document not found' });
    });

    it('should return 403 if user does not own the document', async () => {
        const { handler } = await import('./index.js');

        const documentId = '550e8400-e29b-41d4-a716-446655440000';
        const userId = 'user-123';
        const ownerId = 'user-456';

        dynamoMock.on(GetCommand).resolves({
            Item: {
                PK: `DOC#${documentId}`,
                SK: 'METADATA',
                documentId,
                filename: 'test.pdf',
                s3Key: `uploads/${documentId}/test.pdf`,
                uploadedBy: ownerId,
                uploadedAt: Date.now(),
                fileSize: 1024,
                pageCount: 1,
                chunkCount: 5,
                processingStatus: 'completed',
            },
        });

        const event = createEvent(documentId, userId);
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body)).toEqual({
            error: 'Permission denied: You can only delete your own documents',
        });
    });

    it('should successfully delete document when user owns it', async () => {
        const { handler } = await import('./index.js');

        const documentId = '550e8400-e29b-41d4-a716-446655440000';
        const userId = 'user-123';

        dynamoMock.on(GetCommand).resolves({
            Item: {
                PK: `DOC#${documentId}`,
                SK: 'METADATA',
                documentId,
                filename: 'test.pdf',
                s3Key: `uploads/${documentId}/test.pdf`,
                uploadedBy: userId,
                uploadedAt: Date.now(),
                fileSize: 1024,
                pageCount: 1,
                chunkCount: 5,
                processingStatus: 'completed',
            },
        });

        s3Mock.on(ListObjectsV2Command).resolves({
            Contents: [
                { Key: `uploads/${documentId}/test.pdf` },
                { Key: `processed/${documentId}/text.json` },
            ],
        });

        s3Mock.on(DeleteObjectCommand).resolves({});
        dynamoMock.on(DeleteCommand).resolves({});

        const event = createEvent(documentId, userId);
        const context = createContext();

        const result = await handler(event, context);

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({
            success: true,
            message: 'Document deleted successfully',
        });

        expect(s3Mock.calls().length).toBeGreaterThan(0);

        const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
        expect(deleteCalls.length).toBe(1);
        expect(deleteCalls[0].args[0].input).toMatchObject({
            TableName: 'DocumentMetadata',
            Key: {
                PK: `DOC#${documentId}`,
                SK: 'METADATA',
            },
        });
    });
});
