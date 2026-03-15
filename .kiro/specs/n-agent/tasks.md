# Implementation Plan: Nivulauta Agent

## Overview

This implementation plan breaks down the Nivulauta Agent into discrete coding tasks. The system uses TypeScript for Lambda functions and React/TypeScript for the frontend. The implementation follows a bottom-up approach: infrastructure setup, core backend services, document processing pipeline, frontend interface, and finally integration and testing.

The architecture is serverless-first using AWS Lambda, API Gateway, S3, OpenSearch, DynamoDB, and Bedrock. Each task builds incrementally, ensuring that components are tested and integrated as they're developed.

## Tasks

- [x] 1. Set up infrastructure foundation with Terraform
  - Create Terraform project structure with modules for networking, compute, storage, and security
  - Define VPC with private subnets, NAT Gateway, and VPC endpoints for S3, DynamoDB, and Bedrock
  - Configure S3 buckets for documents (uploads/, processed/, failed/) with KMS encryption and versioning
  - Set up DynamoDB tables: Sessions, ChatHistory, RateLimits, DocumentMetadata with appropriate indexes and TTL
  - Deploy OpenSearch cluster (3-node t3.medium.search) with k-NN plugin enabled in private subnet
  - Configure security groups restricting traffic to necessary ports and sources
  - Create IAM roles with least privilege for Lambda functions, API Gateway, and services
  - Set up CloudWatch log groups with 365-day retention for audit logs
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 4.4, 4.5, 8.5_


- [x] 2. Implement Authentication Service
  - [x] 2.1 Create Lambda Authorizer function for API Gateway
    - Implement JWT token validation with 24-hour expiration
    - Query DynamoDB Sessions table to validate session tokens
    - Return IAM policy document for API Gateway authorization
    - Cache authorization decisions in Lambda memory for 5 minutes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 2.2 Write property test for Authentication Service
    - **Property 1: Invalid Credentials Rejection**
    - **Validates: Requirements 1.2**
  
  - [x] 2.3 Write property test for session expiration
    - **Property 2: Session Token Expiration**
    - **Validates: Requirements 1.3, 1.4**
  
  - [x] 2.4 Create login endpoint Lambda function
    - Implement POST /auth/login handler
    - Validate credentials against user store (DynamoDB or Cognito)
    - Generate JWT session token with userId, username, roles
    - Store session metadata in DynamoDB with TTL
    - Return token and expiration timestamp
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.5 Create logout endpoint Lambda function
    - Implement POST /auth/logout handler
    - Revoke session token by deleting from DynamoDB
    - _Requirements: 1.4_


- [x] 3. Implement WebSocket Manager
  - [x] 3.1 Create WebSocket API in API Gateway with Terraform
    - Define $connect, $disconnect, and chat_message routes
    - Configure Lambda Authorizer for WebSocket connections
    - Set connection timeout to 10 minutes with keep-alive support
    - _Requirements: 2.3, 2.4, 13.5_
  
  - [x] 3.2 Implement WebSocket connection handler Lambda
    - Handle $connect route: store connectionId → userId mapping in DynamoDB
    - Handle $disconnect route: remove connectionId from DynamoDB
    - Implement connection validation and authentication
    - _Requirements: 2.3_
  
  - [x] 3.3 Implement WebSocket message sender utility
    - Create utility function to send messages via API Gateway @connections API
    - Implement error handling for stale connections (410 Gone)
    - Support message types: chat_response, typing_indicator, error, system
    - _Requirements: 2.2, 2.5_
  
  - [x] 3.4 Write property test for WebSocket connection persistence
    - **Property 5: WebSocket Connection Persistence**
    - **Validates: Requirements 2.3**
  
  - [x] 3.5 Write property test for WebSocket reconnection
    - **Property 6: WebSocket Reconnection**
    - **Validates: Requirements 2.4**


- [x] 4. Implement Rate Limiter
  - [x] 4.1 Create rate limiting middleware for Lambda
    - Implement sliding window algorithm using DynamoDB atomic counters
    - Check RateLimits table for current request count
    - Increment counter with conditional write (limit: 60/min regular, 300/min admin)
    - Return HTTP 429 with Retry-After header when limit exceeded
    - Use DynamoDB TTL to auto-reset counters every 60 seconds
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 4.2 Write unit tests for rate limiter
    - Test sliding window algorithm with various request patterns
    - Test counter reset behavior
    - Test admin vs regular user limits
    - _Requirements: 10.1, 10.2, 10.5_


- [x] 5. Implement Audit Logger
  - [x] 5.1 Create structured logging utility for CloudWatch
    - Implement logUserAction, logAPICall, logDocumentOperation functions
    - Use structured JSON format with consistent schema
    - Create separate log groups for different event types
    - Configure CloudWatch Logs Insights queries for common audit scenarios
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 5.2 Write unit tests for audit logger
    - Test JSON structure validation
    - Test log group routing
    - Test required field presence
    - _Requirements: 11.1, 11.2, 11.3_


- [x] 6. Implement Cache Layer with ElastiCache Redis
  - [x] 6.1 Set up ElastiCache Redis cluster with Terraform
    - Deploy Redis cluster mode with 1GB max memory
    - Configure LRU eviction policy
    - Set up security group for Lambda access
    - _Requirements: 12.4_
  
  - [x] 6.2 Create cache utility module
    - Implement getCachedResponse, setCachedResponse with SHA-256 query hashing
    - Implement getCachedSearchResults, setCachedSearchResults with embedding hashing
    - Set TTL: 3600s for Bedrock responses, 900s for search results
    - Handle Redis connection errors gracefully (cache miss on error)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  
  - [x] 6.3 Write unit tests for cache layer
    - Test cache hit/miss scenarios
    - Test TTL expiration
    - Test error handling
    - _Requirements: 12.1, 12.2, 12.3_


- [x] 7. Implement Bedrock Service integration
  - [x] 7.1 Create Bedrock client wrapper for Claude Haiku 4.5 
    - Initialize AWS SDK Bedrock Runtime client
    - Implement generateResponse with streaming support (InvokeModelWithResponseStream)
    - Implement generateResponseSync for non-streaming requests
    - Configure model parameters: max_tokens=2048, temperature=0.7, top_p=0.9
    - Parse streaming response chunks and yield tokens incrementally
    - _Requirements: 3.1, 3.2_
  
  - [x] 7.2 Implement retry logic with exponential backoff
    - Wrap Bedrock API calls with retry decorator (3 attempts)
    - Implement exponential backoff: 1s, 2s, 4s delays
    - Handle throttling errors (ThrottlingException) specifically
    - Log retry attempts to CloudWatch
    - _Requirements: 3.3_
  
  - [x] 7.3 Implement conversation context management
    - Create function to format last 10 messages as Claude message array
    - Include role (user/assistant) and content for each message
    - Implement sliding window to limit context size
    - _Requirements: 3.4_
  
  - [x] 7.4 Write property test for Bedrock API invocation
    - **Property 8: Bedrock API Invocation**
    - **Validates: Requirements 3.1**
  
  - [x] 7.5 Write property test for retry with exponential backoff
    - **Property 9: Retry with Exponential Backoff**
    - **Validates: Requirements 3.3**
  
  - [x] 7.6 Write unit tests for Bedrock Service
    - Test streaming response parsing
    - Test conversation context formatting
    - Test error handling
    - _Requirements: 3.1, 3.2, 3.4_


- [x] 8. Implement Embedding Generator with Bedrock Titan
  - [x] 8.1 Create embedding generation module
    - Initialize Bedrock client for Titan Embeddings v2 (amazon.titan-embed-text-v2:0)
    - Implement generateEmbeddings function for single text input
    - Implement batchGenerateEmbeddings with batch size of 25
    - Parse Bedrock response to extract 1024-dimension vectors
    - _Requirements: 6.1, 6.5_
  
  - [x] 8.2 Implement parallel batch processing
    - Process multiple batches concurrently using Promise.all
    - Handle rate limiting with retry logic
    - Track progress for large document sets
    - _Requirements: 6.2_
  
  - [x] 8.3 Write unit tests for embedding generator
    - Test single embedding generation
    - Test batch processing
    - Test vector dimension validation (1024)
    - _Requirements: 6.1, 6.5_


- [x] 9. Implement Vector Store with OpenSearch
  - [x] 9.1 Create OpenSearch index with k-NN configuration
    - Define index mapping with knn_vector field (1024 dimensions, cosinesimil)
    - Configure HNSW parameters: ef_construction=512, m=16, ef_search=512
    - Set refresh_interval=5s for near-real-time search
    - Create index with proper field types for metadata
    - _Requirements: 7.3_
  
  - [x] 9.2 Implement OpenSearch client wrapper
    - Initialize OpenSearch client with VPC endpoint
    - Implement indexEmbedding for single document chunk
    - Implement batchIndexEmbeddings using bulk API
    - Implement searchSimilar with k-NN query
    - Implement deleteDocument to remove all chunks for a document
    - _Requirements: 6.3, 7.2_
  
  - [x] 9.3 Implement search with metadata filtering
    - Add support for filtering by documentIds, dateRange, metadata
    - Combine k-NN search with bool query filters
    - Return results with score, chunk text, and metadata
    - _Requirements: 7.4_
  
  - [x] 9.4 Write unit tests for Vector Store
    - Test index creation
    - Test bulk indexing
    - Test k-NN search accuracy
    - Test metadata filtering
    - _Requirements: 7.2, 7.3, 7.4_


- [x] 10. Implement Document Processor
  - [x] 10.1 Create PDF text extraction Lambda function
    - Install pdfplumber library for complex layout handling
    - Implement extractText function to process PDF from S3
    - Extract text with page numbers and metadata
    - Handle tables and multi-column layouts
    - Store extracted text in S3 processed/ folder as JSON
    - _Requirements: 5.1, 5.2_
  
  - [x] 10.2 Implement text chunking with token counting
    - Install tiktoken library for accurate token counting (cl100k_base encoding)
    - Implement chunkText function with 512 token chunks and 50 token overlap
    - Preserve page numbers and chunk indices in metadata
    - Generate unique chunkId for each chunk
    - _Requirements: 5.4_
  
  - [x] 10.3 Implement error handling and dead-letter queue
    - Wrap processing in try-catch with detailed error logging
    - Move failed documents to S3 failed/ folder with error.json
    - Update DocumentMetadata table with processing status
    - Send notification to SNS topic for failed processing
    - _Requirements: 5.3, 14.3_
  
  - [x] 10.4 Create S3 event trigger for document processing
    - Configure S3 event notification for uploads/ folder
    - Trigger Document Processor Lambda on object creation
    - Ensure trigger fires within 5 seconds of upload
    - _Requirements: 4.3, 5.5_
  
  - [x] 10.5 Write unit tests for Document Processor
    - Test PDF text extraction with sample documents
    - Test chunking algorithm with various text lengths
    - Test error handling for corrupted PDFs
    - _Requirements: 5.1, 5.2, 5.4_


- [x] 11. Implement document processing orchestration
  - [x] 11.1 Wire Document Processor to Embedding Generator
    - After text extraction and chunking, invoke Embedding Generator
    - Pass text chunks with metadata to embedding generation
    - _Requirements: 5.5, 6.1_
  
  - [x] 11.2 Wire Embedding Generator to Vector Store
    - After embeddings are generated, store in OpenSearch
    - Include document metadata (documentId, filename, pageNumber, uploadedBy, uploadedAt)
    - Update DocumentMetadata table with chunkCount and status=completed
    - _Requirements: 6.3, 6.4_
  
  - [x] 11.3 Write integration tests for document processing pipeline
    - Test end-to-end flow: upload → extract → chunk → embed → index
    - Verify document searchability after processing
    - _Requirements: 5.1, 5.4, 6.1, 6.3_


- [x] 12. Implement Upload Handler
  - [x] 12.1 Create document upload endpoint Lambda
    - Implement POST /documents/upload handler
    - Validate request: filename, fileSize (max 100MB), contentType (application/pdf)
    - Generate unique documentId (UUID)
    - Generate S3 presigned URL for direct upload (15-minute expiration)
    - Store initial DocumentMetadata record with status=pending
    - Return uploadUrl, documentId, expiresAt
    - _Requirements: 4.1, 4.2_
  
  - [x] 12.2 Create document list endpoint Lambda
    - Implement GET /documents handler
    - Query DocumentMetadata table by uploadedBy (GSI)
    - Return paginated list with documentId, filename, uploadedAt, pageCount, status
    - Support nextToken for pagination
    - _Requirements: 4.1_
  
  - [x] 12.3 Create document delete endpoint Lambda
    - Implement DELETE /documents/{documentId} handler
    - Delete document from S3 uploads/ and processed/ folders
    - Delete embeddings from OpenSearch by documentId
    - Delete DocumentMetadata record from DynamoDB
    - Log deletion to audit log
    - _Requirements: 4.1, 11.2_
  
  - [x] 12.4 Write unit tests for Upload Handler
    - Test presigned URL generation
    - Test file size validation
    - Test content type validation
    - _Requirements: 4.1, 4.2_


- [x] 13. Implement Query Router
  - [x] 13.1 Create query classification module
    - Implement heuristic rules for RAG vs direct LLM classification
    - Check for question patterns (who, what, where, when, why, how)
    - Check for document-related keywords (document, file, PDF, page)
    - Check for conversational patterns (greeting, thanks, follow-up)
    - Return requiresRetrieval boolean with confidence score
    - _Requirements: 7.5_
  
  - [x] 13.2 Implement fallback classification with Claude
    - For ambiguous queries (confidence < 0.7), use Claude for classification
    - Send classification prompt to Bedrock
    - Parse response to determine retrieval need
    - _Requirements: 7.5_
  
  - [x] 13.3 Implement dynamic k selection
    - Determine number of chunks to retrieve based on query complexity
    - Default k=5, increase to k=10 for complex queries
    - _Requirements: 7.5_
  
  - [x] 13.4 Write unit tests for Query Router
    - Test heuristic classification with various query types
    - Test confidence scoring
    - Test k selection logic
    - _Requirements: 7.5_


- [x] 14. Implement RAG System
  - [x] 14.1 Create RAG orchestration module
    - Implement retrieveContext function coordinating embedding and search
    - Generate query embedding using Embedding Generator
    - Check cache for query embedding hash
    - Search Vector Store with query embedding
    - Return top k document chunks with scores
    - Cache search results for 15 minutes
    - _Requirements: 7.1, 7.2, 12.2_
  
  - [x] 14.2 Implement context assembly for LLM prompt
    - Format retrieved chunks with document citations (filename, page number)
    - Combine chunks with conversation history
    - Create system prompt instructing Claude to use provided context
    - Limit total context to fit within Claude's context window
    - _Requirements: 7.4_
  
  - [x] 14.3 Write unit tests for RAG System
    - Test context retrieval with mock embeddings
    - Test context assembly formatting
    - Test cache integration
    - _Requirements: 7.1, 7.2, 7.4_


- [x] 15. Implement Chat History Store
  - [x] 15.1 Create chat history persistence module
    - Implement saveMessage function to store in DynamoDB ChatHistory table
    - Use composite key: PK=userId#sessionId, SK=timestamp
    - Encrypt message content using KMS before storage
    - Set TTL for 90-day automatic deletion
    - Complete within 1 second of message send/receive
    - _Requirements: 8.1, 8.2, 8.4, 8.5_
  
  - [x] 15.2 Create chat history retrieval module
    - Implement getHistory function to query ChatHistory table
    - Query with ScanIndexForward=false to get recent messages first
    - Decrypt message content using KMS
    - Support pagination with limit and nextToken
    - Return within 500ms
    - _Requirements: 8.3_
  
  - [x] 15.3 Create chat history endpoint Lambda
    - Implement GET /chat/history handler
    - Accept sessionId, limit, nextToken query parameters
    - Return messages array with pagination
    - _Requirements: 8.3_
  
  - [x] 15.4 Write unit tests for Chat History Store
    - Test message persistence
    - Test encryption/decryption
    - Test pagination
    - Test TTL configuration
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


- [x] 16. Checkpoint - Ensure backend services are functional
  - [x] 16.1 Run all backend unit tests
    - Execute test suites for Authentication Service
    - Execute test suites for Rate Limiter
    - Execute test suites for Audit Logger
    - Execute test suites for Cache Layer
    - Execute test suites for Bedrock Service
    - Execute test suites for Embedding Generator
    - Execute test suites for Vector Store
    - Execute test suites for Document Processor
    - Execute test suites for Chat History Store
    - Verify all tests pass
    - _Requirements: All backend requirements 1.x through 12.x_
  
  - [x] 16.2 Verify backend integration
    - Test document upload and processing pipeline end-to-end
    - Test RAG query flow with embeddings and vector search
    - Test authentication and session management
    - Verify all services are properly integrated
    - _Requirements: Integration of tasks 1-15_


- [x] 17. Implement main chat handler Lambda
  - [x] 17.1 Create WebSocket chat message handler
    - Handle chat_message action from WebSocket
    - Extract userId from connection context
    - Apply rate limiting check
    - Log user action to audit log
    - _Requirements: 10.1, 11.1_
  
  - [x] 17.2 Implement chat processing pipeline
    - Retrieve conversation history from Chat History Store (last 10 messages)
    - Classify query using Query Router
    - If requiresRetrieval=true, invoke RAG System to retrieve context
    - Check cache for identical query hash
    - If cache miss, assemble prompt with context and history
    - _Requirements: 3.4, 7.5, 12.1, 12.3_
  
  - [x] 17.3 Implement streaming response delivery
    - Send typing_indicator message via WebSocket
    - Invoke Bedrock Service with streaming enabled
    - Stream response chunks to client via WebSocket as they arrive
    - Send chat_response messages with isComplete flag
    - Include retrievedChunks metadata in final message
    - _Requirements: 2.2, 2.5, 3.1, 7.4_
  
  - [x] 17.4 Implement response caching and persistence
    - Cache complete response with 1-hour TTL
    - Save user message to Chat History Store
    - Save assistant response to Chat History Store with metadata
    - Log API call to audit log with token count and latency
    - _Requirements: 8.1, 11.3, 12.1_
  
  - [x] 17.5 Implement error handling and fallback
    - Wrap all operations in try-catch blocks
    - If Vector Store unavailable, fall back to direct LLM without retrieval
    - If Bedrock fails after retries, return user-friendly error via WebSocket
    - Implement circuit breaker for external services (5 failure threshold)
    - _Requirements: 14.1, 14.2, 14.4_
  
  - [x] 17.6 Write integration tests for chat handler
    - Test end-to-end chat flow with RAG retrieval
    - Test cache hit scenario
    - Test fallback when Vector Store unavailable
    - Test error handling
    - _Requirements: 3.1, 7.1, 12.1, 14.2_


- [x] 18. Implement performance monitoring and metrics
  - [x] 18.1 Add CloudWatch metrics emission to Lambda functions
    - Emit execution duration for every Lambda invocation
    - Emit custom metrics: query_latency, embedding_generation_time, search_latency
    - Emit Bedrock token usage metrics (input_tokens, output_tokens)
    - _Requirements: 15.1, 15.3_
  
  - [x] 18.2 Add OpenSearch query metrics
    - Emit search latency for every k-NN query
    - Track search result count and scores
    - _Requirements: 15.2_
  
  - [x] 18.3 Create CloudWatch dashboard
    - Display key metrics: request rate, error rate, latency percentiles (p50, p95, p99)
    - Display Bedrock token usage and cost estimates
    - Display cache hit rate
    - Display concurrent user count
    - _Requirements: 15.4_
  
  - [x] 18.4 Configure CloudWatch alarms
    - Create alarm for response time > 2 seconds (threshold from requirements)
    - Create alarm for error rate > 5%
    - Create alarm for Bedrock throttling errors
    - Send notifications to SNS topic
    - _Requirements: 15.5_
  
  - [x] 18.5 Write unit tests for metrics emission
    - Test metric data structure
    - Test metric values calculation
    - _Requirements: 15.1, 15.2, 15.3_


- [x] 19. Implement REST API Gateway configuration
  - [x] 19.1 Create REST API in API Gateway with Terraform
    - Define REST API with resources: /auth, /documents, /chat
    - Configure Lambda integrations for each endpoint
    - Enable CORS for browser access
    - Configure request/response models and validation
    - _Requirements: 13.5_
  
  - [x] 19.2 Configure API Gateway throttling and WAF
    - Set burst limit=100, rate limit=50 requests/second
    - Deploy AWS WAF with rate-based rule
    - Configure IP allowlist/blocklist if needed
    - _Requirements: 10.1_
  
  - [x] 19.3 Configure API Gateway logging
    - Enable CloudWatch Logs for API Gateway
    - Log full request/response for audit trail
    - _Requirements: 11.1_


- [x] 20. Implement Lambda concurrency and scaling configuration
  - [x] 20.1 Configure Lambda concurrency limits
    - Set reserved concurrency for WebSocket handler to support 100 concurrent connections
    - Set provisioned concurrency for latency-sensitive functions
    - Configure memory allocation: 1024MB for light functions, 3008MB for document processing
    - Set timeout: 30s for API handlers, 300s for document processing
    - _Requirements: 9.1, 13.2_
  
  - [x] 20.2 Configure Lambda VPC networking
    - Attach Lambda functions to VPC private subnets for OpenSearch access
    - Configure security groups for Lambda → OpenSearch communication
    - Ensure NAT Gateway for outbound Bedrock API calls
    - _Requirements: 9.1_
  
  - [x] 20.3 Write load tests for concurrent user support
    - Test 100 concurrent WebSocket connections
    - Test 100 concurrent chat requests
    - Verify response times remain under 2 seconds
    - _Requirements: 9.1, 9.3, 9.4, 9.5_


- [x] 21. Implement frontend React application
  - [x] 21.1 Set up React project with TypeScript
    - Initialize React app with TypeScript template
    - Install dependencies: WebSocket client, AWS SDK, UI library (Material-UI or similar)
    - Configure build for S3 deployment
    - _Requirements: 2.1_
  
  - [x] 21.2 Create authentication components
    - Implement Login component with username/password form
    - Implement session token storage in localStorage
    - Implement token refresh logic
    - Implement logout functionality
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [x] 21.3 Create WebSocket connection manager
    - Implement WebSocket client with automatic reconnection
    - Implement exponential backoff for reconnection (1s, 2s, 4s, 8s)
    - Handle connection state: connecting, connected, disconnected
    - Implement keep-alive ping every 5 minutes
    - _Requirements: 2.3, 2.4_
  
  - [x] 21.4 Create chat interface components
    - Implement ChatWindow component displaying message history
    - Implement MessageInput component with send button
    - Display user messages immediately on submission (optimistic UI)
    - Display typing indicator while waiting for response
    - Stream assistant responses token-by-token as they arrive
    - Display document citations for RAG responses
    - _Requirements: 2.1, 2.2, 2.5, 7.4_
  
  - [x] 21.5 Create document management components
    - Implement DocumentUpload component with file picker
    - Validate file type (PDF only) and size (max 100MB) before upload
    - Upload directly to S3 using presigned URL
    - Display upload progress bar
    - Implement DocumentList component showing uploaded documents
    - Implement document delete functionality
    - _Requirements: 4.1, 4.2_
  
  - [x] 21.6 Implement error handling and user feedback
    - Display error messages for failed requests
    - Display rate limit errors with retry countdown
    - Handle WebSocket disconnection gracefully
    - Show reconnection status to user
    - _Requirements: 10.2, 14.1_
  
  - [x] 21.7 Write property test for user message display
    - **Property 3: User Message Display Immediacy**
    - **Validates: Requirements 2.1**
  
  - [x] 21.8 Write property test for response streaming
    - **Property 4: Response Streaming**
    - **Validates: Requirements 2.2**
  
  - [x] 21.9 Write property test for typing indicator
    - **Property 7: Typing Indicator Display**
    - **Validates: Requirements 2.5**


- [x] 22. Deploy frontend to S3 and CloudFront
  - [x] 22.1 Create S3 bucket for static hosting with Terraform
    - Configure S3 bucket for static website hosting
    - Enable versioning for rollback capability
    - Configure bucket policy for CloudFront access
    - _Requirements: 13.1_
  
  - [x] 22.2 Create CloudFront distribution with Terraform
    - Configure CloudFront with S3 origin
    - Enable HTTPS with ACM certificate
    - Configure caching behavior for static assets
    - Set up custom domain if needed
    - _Requirements: 13.1_
  
  - [x] 22.3 Create deployment script
    - Build React app for production
    - Upload build artifacts to S3
    - Invalidate CloudFront cache after deployment
    - _Requirements: 13.1_


- [x] 23. Checkpoint - Ensure frontend integrates with backend
  - Ensure all tests pass, ask the user if questions arise.


- [x] 24. Implement end-to-end integration and testing
  - [x] 24.1 Create integration test suite
    - Test complete user flow: login → upload document → wait for processing → query with RAG
    - Verify document appears in search results after processing
    - Verify chat responses include document citations
    - Test WebSocket connection stability over extended session
    - _Requirements: 2.3, 4.3, 5.1, 7.1, 7.4_
  
  - [x] 24.2 Test error scenarios and resilience
    - Test behavior when OpenSearch is unavailable (should fall back to direct LLM)
    - Test behavior when Bedrock is throttled (should retry with backoff)
    - Test behavior when document processing fails (should move to dead-letter queue)
    - Test circuit breaker activation after 5 consecutive failures
    - _Requirements: 14.2, 14.3, 14.4_
  
  - [x] 24.3 Verify security configurations
    - Verify all S3 buckets have encryption enabled
    - Verify all DynamoDB tables have encryption enabled
    - Verify IAM roles follow least privilege principle
    - Verify API Gateway requires authentication
    - Verify TLS 1.2+ for all data in transit
    - _Requirements: 1.5, 4.4, 4.5, 8.5_
  
  - [x] 24.4 Verify audit logging completeness
    - Verify all user actions are logged with required fields
    - Verify all document operations are logged
    - Verify all Bedrock API calls are logged
    - Verify logs are retained for 365 days
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 24.5 Run performance benchmarks
    - Measure response time for queries without RAG (target: < 2s)
    - Measure response time for queries with RAG (target: < 2s)
    - Measure document processing time for 10MB PDF (target: < 30s)
    - Measure Vector Store query latency (target: < 200ms)
    - Measure cache hit rate over 1000 queries (target: > 30%)
    - _Requirements: 3.2, 5.1, 7.2, 12.5_


- [x] 25. Create deployment documentation and runbooks
  - [x] 25.1 Document infrastructure deployment process
    - Create README with Terraform deployment instructions
    - Document required AWS permissions and prerequisites
    - Document environment variables and configuration
    - Include troubleshooting guide for common deployment issues
    - _Requirements: 13.1_
  
  - [x] 25.2 Document operational procedures
    - Create runbook for monitoring and alerting
    - Document how to investigate CloudWatch alarms
    - Document how to handle failed document processing
    - Document how to scale resources for increased load
    - _Requirements: 15.4, 15.5_
  
  - [x] 25.3 Document cost optimization strategies
    - Document cache configuration and tuning
    - Document Lambda memory/timeout optimization
    - Document OpenSearch instance sizing recommendations
    - Document expected monthly costs for various usage levels
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_


- [x] 26. Final checkpoint - System ready for production
  - Ensure all tests pass, ask the user if questions arise.


- [x] 27. Add VPC Endpoint for Bedrock Agent Runtime
  - [x] 27.1 Add `bedrock-agent-runtime` VPC interface endpoint to networking module
    - Add `aws_vpc_endpoint.bedrock_agent_runtime` resource in `terraform/modules/networking/main.tf`
    - Use service name `com.amazonaws.${region}.bedrock-agent-runtime`
    - Attach to private subnets and VPC endpoints security group
    - Enable private DNS
    - Export endpoint ID in outputs
    - _Requirements: 13.1, 13.4_

  - [x] 27.2 Add IAM permissions for InvokeInlineAgent
    - Add `bedrock:InvokeInlineAgent` to the message handler Lambda's IAM role
    - Scope resource to `arn:aws:bedrock:*:*:*` (inline agents have no specific ARN)
    - _Requirements: 1.5, 13.3_


- [x] 28. Implement MCP Tool Registry (DynamoDB + REST API)
  - [x] 28.1 Create MCPServerConfig DynamoDB table with Terraform
    - Add table definition to `terraform/modules/database/main.tf`
    - PK: `MCP#<serverName>`, SK: `CONFIG`
    - Enable on-demand billing
    - Add IAM read/write permissions for the message handler Lambda role
    - _Requirements: 13.1, 13.4_

  - [x] 28.2 Implement MCP Tool Registry shared module
    - Create `lambda/shared/mcp-registry/` module
    - Implement `listServers()`, `getServer()`, `upsertServer()`, `deleteServer()`, `getEnabledServers()`
    - Use DynamoDB DocumentClient for CRUD operations
    - Cache enabled server configs in Lambda memory with 5-minute TTL
    - _Requirements: 16.1_

  - [x] 28.3 Create REST API endpoints for MCP server management
    - Implement `GET /agent/mcp-servers` — list all server configs
    - Implement `PUT /agent/mcp-servers/{name}` — create/update a server config
    - Implement `DELETE /agent/mcp-servers/{name}` — remove a server config
    - Add Lambda handler and API Gateway routes in Terraform
    - Restrict to admin role via Lambda Authorizer
    - _Requirements: 16.1_

  - [x] 28.4 Seed built-in server configs on deployment
    - Create a seed script or Terraform `null_resource` that inserts default configs
    - Seed `DocumentTools` as a built-in config (marked `builtin: true`)
    - _Requirements: 16.1_

  - [x] 28.5 Write unit tests for MCP Tool Registry
    - Test CRUD operations with mocked DynamoDB
    - Test caching behavior (memory TTL)
    - Test `getEnabledServers` filtering
    - _Requirements: 16.1_


- [x] 29. Implement MCP Client Bridge
  - [x] 29.1 Create MCP Client Bridge shared module
    - Create `lambda/shared/mcp-bridge/` module
    - Add `@modelcontextprotocol/sdk` dependency
    - Implement `initialize()` — connect to all configured MCP servers
    - Implement `discoverTools()` — call `tools/list` on each connected server
    - Implement `executeTool()` — route tool call to the correct MCP server and return result
    - Implement `disconnect()` — clean up all connections
    - _Requirements: 15.1_

  - [x] 29.2 Implement MCP-to-Bedrock schema translation
    - Implement `toActionGroups()` — convert MCP tool schemas to Bedrock `ActionGroupConfig[]`
    - Map MCP `inputSchema.properties` → Bedrock `FunctionDefinition.parameters`
    - Map MCP `inputSchema.required` → Bedrock parameter `required` flags
    - Each MCP server becomes one action group (server name = action group name)
    - Apply `toolFilter` from config to exclude unwanted tools
    - _Requirements: 15.1_

  - [x] 29.3 Implement transport support
    - Support `stdio` transport: spawn MCP server as child process using `StdioClientTransport`
    - Support `sse` transport: connect to remote MCP server using `SSEClientTransport`
    - Support `streamable-http` transport: connect using `StreamableHTTPClientTransport`
    - Pass `env` from config to child process environment for stdio
    - _Requirements: 15.1_

  - [x] 29.4 Write unit tests for MCP Client Bridge
    - Test tool discovery with mock MCP server
    - Test schema translation (MCP → Bedrock action group)
    - Test tool execution routing
    - Test `toolFilter` behavior
    - Test error handling for unreachable servers
    - _Requirements: 15.1_


- [x] 30. Implement Inline Agent Service
  - [x] 30.1 Create Inline Agent Service shared module
    - Create `lambda/shared/inline-agent/` module
    - Add `@aws-sdk/client-bedrock-agent-runtime` dependency
    - Implement `invokeAgent()` using `InvokeInlineAgentCommand`
    - Parse streaming response: handle `chunk`, `trace`, `returnControl`, and `files` event types
    - Yield `AgentResponseChunk` objects for each event
    - _Requirements: 14.1_

  - [x] 30.2 Implement RETURN_CONTROL tool execution loop
    - When agent returns control with a tool invocation:
      1. Identify whether the tool belongs to a built-in action group or an MCP action group
      2. For built-in tools: execute directly using existing shared modules (RAGSystem, DynamoDB)
      3. For MCP tools: delegate to MCP Client Bridge `executeTool()`
      4. Format the result as `returnControlInvocationResults`
      5. Re-invoke `InvokeInlineAgent` with the results to continue the agent loop
    - Handle max iteration limit (default: 10 tool calls per turn) to prevent runaway loops
    - _Requirements: 14.1, 17.1_

  - [x] 30.3 Implement built-in tool executors
    - `SearchDocuments`: wrap `RAGSystem.retrieveContext()` — return formatted chunks with citations
    - `GetDocumentMetadata`: query DynamoDB `DocumentMetadata` table by documentId
    - `ListUserDocuments`: query DynamoDB `DocumentMetadata` table by userId (GSI)
    - Format results as text content for the agent
    - _Requirements: 17.1_

  - [x] 30.4 Implement agent instruction builder
    - Build the agent `instruction` string dynamically based on:
      - Base system prompt (document assistant persona)
      - Available tool descriptions (both built-in and MCP)
      - User context (userId, available documents)
    - Keep instruction under 4096 characters (Bedrock limit)
    - _Requirements: 14.1_

  - [x] 30.5 Write unit tests for Inline Agent Service
    - Test streaming response parsing
    - Test RETURN_CONTROL loop with mock tool execution
    - Test max iteration limit enforcement
    - Test built-in tool executors with mocked dependencies
    - Test instruction builder output
    - _Requirements: 14.1, 17.1_


- [ ] 31. Update Query Router for agent classification
  - [x] 31.1 Add `agent` route type to query classifier
    - Update `QueryClassification` interface to include `routeType: 'rag' | 'direct' | 'agent'`
    - Add heuristic rules for agent routing:
      - Multi-step queries ("compare document A with document B")
      - Explicit agent requests ("use tools to...", "search and then...")
      - Queries requiring multiple document lookups
      - Queries asking about document metadata ("when was X uploaded?")
    - Gate agent routing behind `USE_BEDROCK_AGENT` env var
    - _Requirements: 7.5_

  - [x] 31.2 Update Claude fallback classifier for agent routing
    - Update the classification prompt to include `agent` as a possible route
    - Provide examples of agent-eligible queries in the prompt
    - _Requirements: 7.5_

  - [x] 31.3 Write unit tests for agent classification
    - Test agent routing for multi-step queries
    - Test agent routing disabled when feature flag is off
    - Test backward compatibility (existing rag/direct classification unchanged)
    - _Requirements: 7.5_


- [ ] 32. Integrate agent path into message handler
  - [x] 32.1 Add agent execution path to `processChatMessage`
    - After query classification, if `routeType === 'agent'`:
      1. Load enabled MCP server configs from registry
      2. Initialize MCP Client Bridge and discover tools
      3. Build action groups (built-in + MCP-derived)
      4. Invoke Inline Agent Service with streaming
      5. Stream `AgentResponseChunk` text to WebSocket client
      6. Optionally stream `agent_trace` events for debugging
    - Wrap in circuit breaker; fall back to standard RAG pipeline on failure
    - _Requirements: 14.1, 14.2, 14.4, 17.1_

  - [x] 32.2 Add agent-specific environment variables
    - `USE_BEDROCK_AGENT` — feature flag (default: `false`)
    - `AGENT_FOUNDATION_MODEL` — model ID override (default: same as existing)
    - `AGENT_MAX_ITERATIONS` — max tool calls per turn (default: `10`)
    - `MCP_CONFIG_TABLE` — DynamoDB table name for MCP server configs
    - Add to Terraform Lambda environment configuration
    - _Requirements: 13.2_

  - [ ] 32.3 Add audit logging for agent invocations
    - Log agent invocation start/end with tool usage details
    - Log each tool call (name, parameters, duration, success/failure)
    - Log total agent turn duration and iteration count
    - _Requirements: 11.1, 11.3_

  - [x] 32.4 Write integration tests for agent path
    - Test end-to-end agent flow with mock MCP server
    - Test fallback to RAG when agent fails
    - Test feature flag gating
    - Test agent trace streaming
    - _Requirements: 14.1, 14.2_


- [ ] 33. Terraform updates for agent infrastructure
  - [x] 33.1 Create `terraform/modules/agent/` module
    - Define MCPServerConfig DynamoDB table
    - Define Lambda function for MCP server management REST API
    - Define API Gateway routes for `/agent/mcp-servers`
    - Define IAM roles with `bedrock:InvokeInlineAgent` permission
    - Wire module into root `terraform/main.tf`
    - _Requirements: 13.1, 13.3, 13.4_

  - [x] 33.2 Update message handler Lambda configuration
    - Add new environment variables (`USE_BEDROCK_AGENT`, `MCP_CONFIG_TABLE`, etc.)
    - Increase Lambda timeout to 120s (agent turns can involve multiple tool calls)
    - Increase Lambda memory to 1536MB (MCP client + agent SDK overhead)
    - Add `bedrock:InvokeInlineAgent` to IAM policy
    - _Requirements: 13.2, 13.3_

  - [x] 33.3 Add VPC endpoint for Bedrock Agent Runtime
    - Add interface endpoint for `bedrock-agent-runtime` service
    - Attach to existing private subnets and VPC endpoints security group
    - _Requirements: 13.4_


- [ ] 34. Checkpoint — Agent integration functional
  - [x] 34.1 Verify agent path end-to-end
    - Deploy with `USE_BEDROCK_AGENT=true`
    - Send a multi-step query and verify agent uses tools
    - Verify streaming response arrives via WebSocket
    - Verify agent trace events are logged
    - Verify fallback to RAG when agent is disabled
    - _Requirements: All agent requirements_

  - [-] 34.2 Verify MCP server management
    - Add a new MCP server config via REST API
    - Verify the agent picks up the new tools on next invocation
    - Disable the server and verify tools are no longer available
    - Delete the server config and verify cleanup
    - _Requirements: 16.1_

  - [ ] 34.3 Run all existing tests to verify no regressions
    - Execute full test suite
    - Verify existing RAG pipeline still works when agent is disabled
    - _Requirements: All existing requirements_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The implementation uses TypeScript for Lambda functions and React frontend
- Infrastructure is defined using Terraform for reproducible deployments
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end system behavior
- The system prioritizes serverless architecture for automatic scaling and cost efficiency
- Security is built-in with encryption, least privilege IAM, and comprehensive audit logging
