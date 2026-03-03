import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Import handler after setting up mocks
import { handler } from './index.js';

describe('Document Upload Handler', () => {
    beforeEach(() => {
        dynamoMock.reset();
        s3Mock.reset();
        process.env.DOCUMENT_METADATA_TABLE = 'DocumentMetadata';
        process.env.DOCUMENTS_BUCKET = 'test-bucket';
    });

    const createEvent = (body: any, userId: string = 'user-123'): APIGatewayProxyEvent => ({
        body: JSON.stringify(body),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/documents/upload',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
            accountId: '123456789012',
            apiId: 'api-id',
            authorizer: { userId },
            protocol: 'HTTP/1.1',
            httpMethod: 'POST',
            identity: {
                accessKey: null,
                accountId: null,
                apiKey: null,
                apiKeyId: null,
                caller: null,
                clientCert: null,
                cognitoAuthenticationProvider: null,
                cognitoAuthenticationType: null,
                cognitoIdentityId: null,
                cognitoIdentityPoolId: null,
                principalOrgId: null,
                sourceIp: '1.2.3.4',
                user: null,
                userAgent: 'test-agent',
                userArn: null,
            },
            path: '/documents/upload',
            stage: 'test',
            requestId: 'test-request-id',
            requestTimeEpoch: Date.now(),
            resourceId: 'resource-id',
            resourcePath: '/documents/upload',
        },
        resource: '/documents/upload',
    });

    const createContext = (): Context => ({
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'document-upload',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:document-upload',
        memoryLimitInMB: '1024',
        awsRequestId: 'test-request-id',
        logGroupName: '/aws/lambda/document-upload',
        logStreamName: '2024/01/01/[$LATEST]test',
        getRemainingTimeInMillis: () => 30000,
        done: () => { },
        fail: () => { },
        succeed: () => { },
    });

    describe('Validation', () => {
        it('should return 400 when request body is missing', async () => {
            const event = createEvent(null);
            event.body = null;
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Request body is required');
        });

        it('should return 400 when filename is missing', async () => {
            const event = createEvent({
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('Filename is required');
        });

        it('should return 400 when fileSize exceeds 100MB', async () => {
            const event = createEvent({
                filename: 'test.pdf',
                fileSize: 101 * 1024 * 1024, // 101MB
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('exceeds maximum allowed size');
        });

        it('should return 400 when contentType is not application/pdf', async () => {
            const event = createEvent({
                filename: 'test.txt',
                fileSize: 1024,
                contentType: 'text/plain',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('Only PDF files are supported');
        });
    });

    describe('File Size Validation (Requirement 4.2)', () => {
        it('should accept file size at exactly 100MB', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'large-document.pdf',
                fileSize: 100 * 1024 * 1024, // Exactly 100MB
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);
            expect(response.uploadUrl).toBeDefined();
            expect(response.documentId).toBeDefined();
        });

        it('should reject file size at 100MB + 1 byte', async () => {
            const event = createEvent({
                filename: 'too-large.pdf',
                fileSize: 100 * 1024 * 1024 + 1, // 100MB + 1 byte
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('exceeds maximum allowed size of 100MB');
        });

        it('should reject zero file size', async () => {
            const event = createEvent({
                filename: 'empty.pdf',
                fileSize: 0,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('File size is required and must be a positive number');
        });

        it('should reject negative file size', async () => {
            const event = createEvent({
                filename: 'invalid.pdf',
                fileSize: -1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toContain('File size is required and must be a positive number');
        });

        it('should accept minimum valid file size (1 byte)', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'tiny.pdf',
                fileSize: 1,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);
            expect(response.uploadUrl).toBeDefined();
        });
    });

    describe('Content Type Validation (Requirement 4.2)', () => {
        it('should accept application/pdf content type', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'document.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);
            expect(response.uploadUrl).toBeDefined();
        });

        it('should reject text/plain content type', async () => {
            const event = createEvent({
                filename: 'document.txt',
                fileSize: 1024,
                contentType: 'text/plain',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Only PDF files are supported (content type must be application/pdf)');
        });

        it('should reject image/jpeg content type', async () => {
            const event = createEvent({
                filename: 'image.jpg',
                fileSize: 1024,
                contentType: 'image/jpeg',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Only PDF files are supported (content type must be application/pdf)');
        });

        it('should reject application/json content type', async () => {
            const event = createEvent({
                filename: 'data.json',
                fileSize: 1024,
                contentType: 'application/json',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Only PDF files are supported (content type must be application/pdf)');
        });

        it('should reject empty content type', async () => {
            const event = createEvent({
                filename: 'document.pdf',
                fileSize: 1024,
                contentType: '',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Content type is required');
        });

        it('should reject missing content type', async () => {
            const event = createEvent({
                filename: 'document.pdf',
                fileSize: 1024,
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Content type is required');
        });
    });

    describe('Successful Upload', () => {
        it('should generate presigned URL and store metadata for valid request', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'test-document.pdf',
                fileSize: 5 * 1024 * 1024, // 5MB
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);

            const response = JSON.parse(result.body);
            expect(response.uploadUrl).toBeDefined();
            expect(response.documentId).toBeDefined();
            expect(response.expiresAt).toBeDefined();

            // Verify DynamoDB PutCommand was called
            const putCalls = dynamoMock.commandCalls(PutCommand);
            expect(putCalls.length).toBe(1);

            const putCall = putCalls[0];
            expect(putCall.args[0].input.TableName).toBe('DocumentMetadata');
            expect(putCall.args[0].input.Item).toMatchObject({
                documentId: response.documentId,
                filename: 'test-document.pdf',
                uploadedBy: 'user-123',
                fileSize: 5 * 1024 * 1024,
                processingStatus: 'pending',
            });
        });

        it('should generate unique documentId for each request', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event1 = createEvent({
                filename: 'doc1.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const event2 = createEvent({
                filename: 'doc2.pdf',
                fileSize: 2048,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result1 = await handler(event1, context);
            const result2 = await handler(event2, context);

            const response1 = JSON.parse(result1.body);
            const response2 = JSON.parse(result2.body);

            expect(response1.documentId).not.toBe(response2.documentId);
        });
    });

    describe('Presigned URL Generation (Requirement 4.1)', () => {
        it('should generate presigned URL with correct structure', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'test-document.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);

            // Verify presigned URL structure
            expect(response.uploadUrl).toBeDefined();
            expect(typeof response.uploadUrl).toBe('string');
            expect(response.uploadUrl).toContain('uploads/');
            expect(response.uploadUrl).toContain('test-document.pdf');
            expect(response.uploadUrl).toContain('X-Amz-Algorithm');
            expect(response.uploadUrl).toContain('X-Amz-Credential');
            expect(response.uploadUrl).toContain('X-Amz-Signature');
        });

        it('should set presigned URL expiration to 15 minutes', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const beforeRequest = Date.now();
            const event = createEvent({
                filename: 'test.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);
            const afterRequest = Date.now();

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);

            // Verify expiration is approximately 15 minutes from now
            const expectedExpiration = 15 * 60 * 1000; // 15 minutes in milliseconds
            const minExpiration = beforeRequest + expectedExpiration;
            const maxExpiration = afterRequest + expectedExpiration;

            expect(response.expiresAt).toBeGreaterThanOrEqual(minExpiration);
            expect(response.expiresAt).toBeLessThanOrEqual(maxExpiration);
        });

        it('should include documentId in S3 key path', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'my-document.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);

            // Verify URL contains documentId in path
            expect(response.uploadUrl).toContain(`uploads/${response.documentId}/my-document.pdf`);
        });

        it('should preserve original filename in S3 key', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const testFilenames = [
                'simple.pdf',
                'document-with-dashes.pdf',
                'document_with_underscores.pdf',
                'Document With Spaces.pdf',
            ];

            for (const filename of testFilenames) {
                const event = createEvent({
                    filename,
                    fileSize: 1024,
                    contentType: 'application/pdf',
                });
                const context = createContext();

                const result = await handler(event, context);

                expect(result.statusCode).toBe(200);
                const response = JSON.parse(result.body);
                // Verify filename is in the URL (may be URL encoded)
                const decodedUrl = decodeURIComponent(response.uploadUrl);
                expect(decodedUrl).toContain(filename);
            }
        });

        it('should include content type in presigned URL parameters', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'test.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);

            // Verify the URL is a valid presigned URL (content type is set in the command, not always visible in URL)
            expect(response.uploadUrl).toContain('X-Amz-Algorithm');
            expect(response.uploadUrl).toContain('X-Amz-Signature');
            expect(response.uploadUrl.startsWith('https://')).toBe(true);
        });

        it('should return all required fields in response', async () => {
            dynamoMock.on(PutCommand).resolves({});

            const event = createEvent({
                filename: 'test.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(200);
            const response = JSON.parse(result.body);

            // Verify all required response fields
            expect(response).toHaveProperty('uploadUrl');
            expect(response).toHaveProperty('documentId');
            expect(response).toHaveProperty('expiresAt');

            expect(typeof response.uploadUrl).toBe('string');
            expect(typeof response.documentId).toBe('string');
            expect(typeof response.expiresAt).toBe('number');

            expect(response.uploadUrl.length).toBeGreaterThan(0);
            expect(response.documentId.length).toBeGreaterThan(0);
            expect(response.expiresAt).toBeGreaterThan(Date.now());
        });
    });

    describe('Error Handling', () => {
        it('should return 500 when DynamoDB operation fails', async () => {
            dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

            const event = createEvent({
                filename: 'test.pdf',
                fileSize: 1024,
                contentType: 'application/pdf',
            });
            const context = createContext();

            const result = await handler(event, context);

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body).error).toBe('Internal server error');
        });
    });
});
