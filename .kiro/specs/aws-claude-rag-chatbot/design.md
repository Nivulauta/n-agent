# Design Document: AWS Claude RAG Chatbot

## Overview

This design document specifies the architecture for a production-ready RAG (Retrieval-Augmented Generation) chatbot system built on AWS serverless infrastructure. The system combines Claude 3 Sonnet via Amazon Bedrock with semantic document search to provide accurate, context-aware responses grounded in organizational knowledge.

The architecture follows a serverless-first approach using AWS Lambda, API Gateway, S3, OpenSearch, and DynamoDB to achieve automatic scaling, high availability, and cost efficiency. The system supports 100 concurrent users with sub-2-second response times while maintaining operational costs under $200/month for moderate usage.

Key architectural principles:
- **Serverless-first**: Minimize operational overhead and enable automatic scaling
- **Security by design**: Encryption at rest and in transit, least privilege IAM, comprehensive audit logging
- **Cost optimization**: Intelligent caching, efficient resource allocation, pay-per-use pricing
- **Resilience**: Circuit breakers, fallback mechanisms, graceful degradation
- **Observability**: Comprehensive metrics, logging, and alerting via CloudWatch

The system processes user queries through a multi-stage pipeline:
1. Authentication and rate limiting via API Gateway
2. Query classification to determine if RAG retrieval is needed
3. Vector search in OpenSearch to find relevant document chunks (if needed)
4. Context assembly with conversation history and retrieved documents
5. Claude 3 Sonnet invocation via Bedrock with streaming response
6. Real-time response delivery via WebSocket
7. Persistence of conversation history and audit logs

## Architecture

### High-Level Architecture

The system consists of three primary layers:

**Presentation Layer**
- React-based single-page application hosted on S3 + CloudFront
- WebSocket client for real-time bidirectional communication
- REST API client for document management operations

**Application Layer**
- API Gateway (REST + WebSocket APIs) for request routing and authentication
- Lambda functions for business logic execution
- ElastiCache (Redis) for response and search result caching
- Step Functions for document processing orchestration

**Data Layer**
- S3 for PDF document storage with versioning and encryption
- OpenSearch for vector embeddings and semantic search
- DynamoDB for chat history, user sessions, and rate limiting
- CloudWatch Logs for audit trails and system logs

### Component Interaction Flow

```
User Browser
    ↓ (HTTPS)
CloudFront + S3 (Static Assets)
    ↓ (WSS/HTTPS)
API Gateway (REST + WebSocket)
    ↓ (Invoke)
Lambda Authorizer → DynamoDB (Sessions)
    ↓ (Invoke)
Lambda Handler
    ├→ ElastiCache (Check Cache)
    ├→ Query Router (Classify Query)
    ├→ OpenSearch (Vector Search) ← Bedrock Titan (Query Embedding)
    ├→ DynamoDB (Chat History)
    └→ Bedrock Claude 3 Sonnet (Generate Response)
    ↓ (Stream)
WebSocket Connection → User Browser

Document Upload Flow:
User Browser → API Gateway → Lambda Upload Handler → S3
    ↓ (S3 Event)
Lambda Document Processor
    ├→ Text Extraction (PyPDF2/pdfplumber)
    ├→ Text Chunking (512 tokens, 50 overlap)
    └→ Bedrock Titan Embeddings
        ↓
    OpenSearch (Store Vectors + Metadata)
```

### Infrastructure Architecture

**Networking**
- VPC with private subnets for OpenSearch and Lambda functions
- NAT Gateway for outbound internet access from private subnets
- VPC Endpoints for S3, DynamoDB, and Bedrock to avoid internet routing
- Security groups restricting traffic to necessary ports and sources

**Compute**
- Lambda functions with 1024MB-3008MB memory based on workload
- Provisioned concurrency for latency-sensitive functions (WebSocket handler)
- Reserved concurrency limits to prevent runaway costs

**Storage**
- S3 Standard for active documents, S3 Intelligent-Tiering for older documents
- OpenSearch with 3-node cluster (t3.medium.search) for high availability
- DynamoDB on-demand pricing for variable workloads

**Security**
- AWS WAF on API Gateway for DDoS protection and IP filtering
- KMS customer-managed keys for S3 and DynamoDB encryption
- Secrets Manager for API keys and sensitive configuration
- IAM roles with least privilege for all service-to-service communication

## Components and Interfaces

### 1. Authentication Service

**Responsibility**: Manage user authentication, session tokens, and authorization

**Implementation**: Lambda Authorizer + DynamoDB

**Interfaces**:
```typescript
interface AuthenticationService {
  // Authenticate user credentials and generate session token
  authenticate(credentials: UserCredentials): Promise<SessionToken>
  
  // Validate session token and return user context
  validateSession(token: string): Promise<UserContext>
  
  // Revoke session token
  revokeSession(token: string): Promise<void>
  
  // Check if user has permission for action
  authorize(userId: string, action: string, resource: string): Promise<boolean>
}

interface UserCredentials {
  username: string
  password: string
}

interface SessionToken {
  token: string
  expiresAt: number
  userId: string
}

interface UserContext {
  userId: string
  username: string
  roles: string[]
  sessionId: string
}
```

**Key Design Decisions**:
- Use JWT tokens with 24-hour expiration for stateless authentication
- Store session metadata in DynamoDB with TTL for automatic cleanup
- Implement Lambda Authorizer for centralized authentication logic
- Cache authorization decisions in Lambda memory for 5 minutes

### 2. WebSocket Manager

**Responsibility**: Manage persistent WebSocket connections for real-time communication

**Implementation**: API Gateway WebSocket API + Lambda handlers + DynamoDB

**Interfaces**:
```typescript
interface WebSocketManager {
  // Handle new WebSocket connection
  onConnect(connectionId: string, userId: string): Promise<void>
  
  // Handle WebSocket disconnection
  onDisconnect(connectionId: string): Promise<void>
  
  // Send message to specific connection
  sendMessage(connectionId: string, message: Message): Promise<void>
  
  // Broadcast message to all user connections
  broadcastToUser(userId: string, message: Message): Promise<void>
}

interface Message {
  type: 'chat_response' | 'typing_indicator' | 'error' | 'system'
  payload: any
  timestamp: number
}
```

**Key Design Decisions**:
- Store connectionId → userId mapping in DynamoDB for message routing
- Implement automatic reconnection with exponential backoff on client
- Use API Gateway's @connections API for sending messages to clients
- Handle connection timeouts (10 minutes idle) with keep-alive pings

### 3. Query Router

**Responsibility**: Classify queries to determine if RAG retrieval is needed

**Implementation**: Lambda function with rule-based + ML classification

**Interfaces**:
```typescript
interface QueryRouter {
  // Classify query and determine retrieval strategy
  classifyQuery(query: string, conversationContext: Message[]): Promise<QueryClassification>
}

interface QueryClassification {
  requiresRetrieval: boolean
  confidence: number
  reasoning: string
  suggestedK: number // Number of documents to retrieve
}
```

**Key Design Decisions**:
- Use heuristic rules for initial classification (keywords, question patterns)
- Fall back to Claude for ambiguous cases with classification prompt
- Cache classification results for similar queries
- Default to RAG retrieval when confidence < 0.7

### 4. RAG System

**Responsibility**: Orchestrate document retrieval and context assembly

**Implementation**: Lambda function coordinating OpenSearch and Bedrock

**Interfaces**:
```typescript
interface RAGSystem {
  // Retrieve relevant document chunks for query
  retrieveContext(query: string, k: number): Promise<DocumentChunk[]>
  
  // Generate query embedding
  generateQueryEmbedding(query: string): Promise<number[]>
  
  // Assemble context for LLM prompt
  assembleContext(
    query: string,
    chunks: DocumentChunk[],
    conversationHistory: Message[]
  ): Promise<string>
}

interface DocumentChunk {
  chunkId: string
  documentId: string
  documentName: string
  pageNumber: number
  text: string
  score: number // Similarity score
  metadata: Record<string, any>
}
```

**Key Design Decisions**:
- Use Amazon Bedrock Titan Embeddings v2 (amazon.titan-embed-text-v2:0) with 1024 dimensions for consistency
- Implement hybrid search combining vector similarity and keyword matching
- Cache query embeddings for 15 minutes to reduce Bedrock calls
- Include document metadata (filename, page) in context for citations

### 5. Bedrock Service

**Responsibility**: Interface with Claude 3 Sonnet via Amazon Bedrock

**Implementation**: Lambda function with AWS SDK for Bedrock

**Interfaces**:
```typescript
interface BedrockService {
  // Generate streaming response from Claude
  generateResponse(request: GenerationRequest): AsyncIterator<ResponseChunk>
  
  // Generate non-streaming response
  generateResponseSync(request: GenerationRequest): Promise<string>
}

interface GenerationRequest {
  prompt: string
  systemPrompt?: string
  maxTokens: number
  temperature: number
  topP: number
  stopSequences?: string[]
  conversationHistory?: Message[]
}

interface ResponseChunk {
  text: string
  isComplete: boolean
  tokenCount?: number
}
```

**Key Design Decisions**:
- Use Claude 3 Sonnet (anthropic.claude-3-sonnet-20240229-v1:0) for balance of cost and quality
- Implement streaming via Bedrock's InvokeModelWithResponseStream API
- Set max_tokens=2048, temperature=0.7 for conversational responses
- Include last 10 messages as conversation context (sliding window)
- Implement exponential backoff retry (3 attempts) for throttling errors

### 6. Document Processor

**Responsibility**: Extract text from PDFs and prepare for embedding

**Implementation**: Lambda function with PyPDF2/pdfplumber + Step Functions orchestration

**Interfaces**:
```typescript
interface DocumentProcessor {
  // Process uploaded PDF document
  processDocument(s3Key: string): Promise<ProcessingResult>
  
  // Extract text from PDF
  extractText(pdfBytes: Buffer): Promise<ExtractedText>
  
  // Chunk text into segments
  chunkText(text: string, chunkSize: number, overlap: number): Promise<TextChunk[]>
}

interface ProcessingResult {
  documentId: string
  status: 'success' | 'failed'
  chunkCount: number
  errorMessage?: string
}

interface ExtractedText {
  text: string
  pageCount: number
  metadata: DocumentMetadata
}

interface TextChunk {
  text: string
  chunkIndex: number
  pageNumber: number
  tokenCount: number
}

interface DocumentMetadata {
  filename: string
  uploadedBy: string
  uploadedAt: number
  fileSize: number
  pageCount: number
}
```

**Key Design Decisions**:
- Use pdfplumber for complex layouts (tables, multi-column)
- Chunk at 512 tokens with 50 token overlap to preserve context
- Use tiktoken library for accurate token counting (cl100k_base encoding)
- Process documents asynchronously via Step Functions for large files
- Store processing status in DynamoDB for progress tracking

### 7. Embedding Generator

**Responsibility**: Generate vector embeddings for document chunks

**Implementation**: Lambda function with Bedrock Titan Embeddings

**Interfaces**:
```typescript
interface EmbeddingGenerator {
  // Generate embeddings for text chunks
  generateEmbeddings(chunks: TextChunk[]): Promise<Embedding[]>
  
  // Batch process embeddings efficiently
  batchGenerateEmbeddings(chunks: TextChunk[], batchSize: number): Promise<Embedding[]>
}

interface Embedding {
  chunkId: string
  vector: number[] // 1024 dimensions (Titan Embeddings v2)
  text: string
  metadata: ChunkMetadata
}

interface ChunkMetadata {
  documentId: string
  documentName: string
  pageNumber: number
  chunkIndex: number
  uploadedAt: number
}
```

**Key Design Decisions**:
- Use amazon.titan-embed-text-v2:0 model (1024 dimensions)
- Batch embeddings in groups of 25 to optimize throughput
- Implement parallel processing with Lambda concurrency
- Store embeddings in OpenSearch with document metadata for filtering

### 8. Vector Store

**Responsibility**: Store and search vector embeddings

**Implementation**: Amazon OpenSearch Service with k-NN plugin

**Interfaces**:
```typescript
interface VectorStore {
  // Index document embedding
  indexEmbedding(embedding: Embedding): Promise<void>
  
  // Batch index embeddings
  batchIndexEmbeddings(embeddings: Embedding[]): Promise<void>
  
  // Search for similar vectors
  searchSimilar(queryVector: number[], k: number, filters?: SearchFilters): Promise<SearchResult[]>
  
  // Delete document embeddings
  deleteDocument(documentId: string): Promise<void>
}

interface SearchFilters {
  documentIds?: string[]
  dateRange?: { start: number; end: number }
  metadata?: Record<string, any>
}

interface SearchResult {
  chunkId: string
  score: number
  chunk: DocumentChunk
}
```

**Key Design Decisions**:
- Use OpenSearch k-NN with HNSW algorithm for approximate nearest neighbor search
- Configure index with 1024 dimensions (Titan Embeddings v2), cosine similarity metric
- Set ef_construction=512, m=16 for balance of accuracy and performance
- Implement index refresh interval of 5 seconds for near-real-time search
- Use OpenSearch's filtering capabilities for metadata-based search refinement

### 9. Chat History Store

**Responsibility**: Persist conversation history

**Implementation**: DynamoDB with composite key design

**Interfaces**:
```typescript
interface ChatHistoryStore {
  // Save message to history
  saveMessage(message: ChatMessage): Promise<void>
  
  // Retrieve conversation history
  getHistory(userId: string, sessionId: string, limit: number): Promise<ChatMessage[]>
  
  // Delete old conversations (TTL-based)
  deleteExpiredHistory(): Promise<void>
}

interface ChatMessage {
  userId: string
  sessionId: string
  messageId: string
  timestamp: number
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    retrievedChunks?: string[]
    tokenCount?: number
    latency?: number
  }
}
```

**Key Design Decisions**:
- Use composite key: PK=userId#sessionId, SK=timestamp
- Enable DynamoDB TTL for automatic deletion after 90 days
- Encrypt all message content using KMS
- Use DynamoDB Streams for audit log generation
- Query with ScanIndexForward=false to get recent messages first

### 10. Cache Layer

**Responsibility**: Cache responses and search results to reduce costs

**Implementation**: Amazon ElastiCache for Redis

**Interfaces**:
```typescript
interface CacheLayer {
  // Get cached response
  getCachedResponse(queryHash: string): Promise<string | null>
  
  // Set cached response with TTL
  setCachedResponse(queryHash: string, response: string, ttlSeconds: number): Promise<void>
  
  // Get cached search results
  getCachedSearchResults(queryEmbeddingHash: string): Promise<DocumentChunk[] | null>
  
  // Set cached search results with TTL
  setCachedSearchResults(
    queryEmbeddingHash: string,
    results: DocumentChunk[],
    ttlSeconds: number
  ): Promise<void>
}
```

**Key Design Decisions**:
- Use Redis cluster mode for high availability
- Cache Bedrock responses for 1 hour (3600s TTL)
- Cache OpenSearch results for 15 minutes (900s TTL)
- Implement LRU eviction policy with 1GB max memory
- Hash queries using SHA-256 for cache keys

### 11. Rate Limiter

**Responsibility**: Enforce request rate limits per user

**Implementation**: DynamoDB with conditional writes + API Gateway throttling

**Interfaces**:
```typescript
interface RateLimiter {
  // Check if request is allowed
  checkRateLimit(userId: string): Promise<RateLimitResult>
  
  // Increment request count
  incrementRequestCount(userId: string): Promise<void>
  
  // Get current rate limit status
  getRateLimitStatus(userId: string): Promise<RateLimitStatus>
}

interface RateLimitResult {
  allowed: boolean
  remainingRequests: number
  resetAt: number
}

interface RateLimitStatus {
  requestCount: number
  limit: number
  windowStart: number
  windowEnd: number
}
```

**Key Design Decisions**:
- Implement sliding window algorithm using DynamoDB atomic counters
- Set limit: 60 requests/minute for regular users, 300 for admins
- Use DynamoDB TTL to auto-reset counters every 60 seconds
- Return HTTP 429 with Retry-After header when limit exceeded
- Configure API Gateway throttling as secondary defense (burst=100, rate=50/sec)

### 12. Audit Logger

**Responsibility**: Record all system interactions for compliance

**Implementation**: CloudWatch Logs with structured logging

**Interfaces**:
```typescript
interface AuditLogger {
  // Log user action
  logUserAction(event: UserActionEvent): Promise<void>
  
  // Log API call
  logAPICall(event: APICallEvent): Promise<void>
  
  // Log document operation
  logDocumentOperation(event: DocumentOperationEvent): Promise<void>
}

interface UserActionEvent {
  eventType: 'login' | 'logout' | 'query' | 'upload' | 'delete'
  userId: string
  sessionId: string
  timestamp: number
  ipAddress: string
  userAgent: string
  metadata?: Record<string, any>
}

interface APICallEvent {
  service: 'bedrock' | 'opensearch' | 's3'
  operation: string
  requestId: string
  userId: string
  timestamp: number
  duration: number
  statusCode: number
  tokenCount?: number
}

interface DocumentOperationEvent {
  operation: 'upload' | 'delete' | 'process'
  documentId: string
  documentName: string
  userId: string
  timestamp: number
  fileSize?: number
  status: 'success' | 'failed'
  errorMessage?: string
}
```

**Key Design Decisions**:
- Use structured JSON logging for easy parsing and analysis
- Create separate log groups for different event types
- Enable CloudWatch Logs Insights for querying
- Set retention period to 365 days for compliance
- Use CloudWatch Logs subscription filters for real-time alerting

### 13. Upload Handler

**Responsibility**: Handle document upload requests

**Implementation**: Lambda function with S3 presigned URLs

**Interfaces**:
```typescript
interface UploadHandler {
  // Generate presigned URL for direct S3 upload
  generateUploadURL(request: UploadRequest): Promise<UploadURL>
  
  // Confirm upload completion
  confirmUpload(documentId: string): Promise<void>
  
  // Validate uploaded file
  validateUpload(s3Key: string): Promise<ValidationResult>
}

interface UploadRequest {
  filename: string
  fileSize: number
  contentType: string
  userId: string
}

interface UploadURL {
  uploadUrl: string
  documentId: string
  expiresAt: number
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}
```

**Key Design Decisions**:
- Use S3 presigned URLs for direct browser-to-S3 uploads (avoid Lambda payload limits)
- Set presigned URL expiration to 15 minutes
- Validate file type (application/pdf) and size (max 100MB) before generating URL
- Trigger document processing via S3 event notification
- Store upload metadata in DynamoDB for tracking

## Data Models

### DynamoDB Tables

#### Sessions Table
```typescript
interface SessionRecord {
  PK: string // "SESSION#<sessionId>"
  SK: string // "SESSION#<sessionId>"
  userId: string
  username: string
  roles: string[]
  createdAt: number
  lastAccessedAt: number
  expiresAt: number // TTL attribute
  ipAddress: string
}

// GSI: userId-index
// PK: userId, SK: createdAt
```

#### ChatHistory Table
```typescript
interface ChatHistoryRecord {
  PK: string // "USER#<userId>#SESSION#<sessionId>"
  SK: number // timestamp
  messageId: string
  role: 'user' | 'assistant'
  content: string // Encrypted
  metadata: {
    retrievedChunks?: string[]
    tokenCount?: number
    latency?: number
    cached?: boolean
  }
  ttl: number // Expires after 90 days
}
```

#### RateLimits Table
```typescript
interface RateLimitRecord {
  PK: string // "USER#<userId>"
  SK: string // "WINDOW#<windowStart>"
  requestCount: number
  limit: number
  windowStart: number
  windowEnd: number
  ttl: number // Auto-delete after window expires
}
```

#### DocumentMetadata Table
```typescript
interface DocumentMetadataRecord {
  PK: string // "DOC#<documentId>"
  SK: string // "METADATA"
  documentId: string
  filename: string
  s3Key: string
  uploadedBy: string
  uploadedAt: number
  fileSize: number
  pageCount: number
  chunkCount: number
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage?: string
}

// GSI: uploadedBy-index
// PK: uploadedBy, SK: uploadedAt
```

### OpenSearch Index Schema

#### Documents Index
```json
{
  "mappings": {
    "properties": {
      "chunkId": { "type": "keyword" },
      "documentId": { "type": "keyword" },
      "documentName": { "type": "text" },
      "pageNumber": { "type": "integer" },
      "chunkIndex": { "type": "integer" },
      "text": { "type": "text" },
      "embedding": {
        "type": "knn_vector",
        "dimension": 1024,
        "method": {
          "name": "hnsw",
          "space_type": "cosinesimil",
          "engine": "lucene",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      },
      "uploadedAt": { "type": "date" },
      "uploadedBy": { "type": "keyword" }
    }
  },
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512,
      "refresh_interval": "5s"
    }
  }
}
```

### S3 Bucket Structure

```
s3://chatbot-documents-{account-id}/
├── uploads/
│   └── {documentId}/
│       └── {filename}.pdf
├── processed/
│   └── {documentId}/
│       ├── text.json
│       └── chunks.json
└── failed/
    └── {documentId}/
        ├── {filename}.pdf
        └── error.json
```

### API Schemas

#### REST API Endpoints

**POST /auth/login**
```typescript
Request:
{
  username: string
  password: string
}

Response:
{
  token: string
  expiresAt: number
  userId: string
}
```

**POST /documents/upload**
```typescript
Request:
{
  filename: string
  fileSize: number
  contentType: string
}

Response:
{
  uploadUrl: string
  documentId: string
  expiresAt: number
}
```

**GET /documents**
```typescript
Response:
{
  documents: Array<{
    documentId: string
    filename: string
    uploadedAt: number
    pageCount: number
    status: string
  }>
  nextToken?: string
}
```

**DELETE /documents/{documentId}**
```typescript
Response:
{
  success: boolean
  message: string
}
```

**GET /chat/history**
```typescript
Query Parameters:
- sessionId: string
- limit?: number (default: 50)
- nextToken?: string

Response:
{
  messages: ChatMessage[]
  nextToken?: string
}
```

#### WebSocket API Messages

**Client → Server: chat_message**
```typescript
{
  action: "chat_message"
  data: {
    message: string
    sessionId: string
  }
}
```

**Server → Client: chat_response**
```typescript
{
  type: "chat_response"
  data: {
    messageId: string
    content: string
    isComplete: boolean
    retrievedChunks?: Array<{
      documentName: string
      pageNumber: number
      text: string
    }>
  }
}
```

**Server → Client: typing_indicator**
```typescript
{
  type: "typing_indicator"
  data: {
    isTyping: boolean
  }
}
```

**Server → Client: error**
```typescript
{
  type: "error"
  data: {
    code: string
    message: string
    retryable: boolean
  }
}
```

### Bedrock API Request Format

**Claude 3 Sonnet Request**
```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 2048,
  "temperature": 0.7,
  "top_p": 0.9,
  "messages": [
    {
      "role": "user",
      "content": "Previous conversation context..."
    },
    {
      "role": "assistant",
      "content": "Previous response..."
    },
    {
      "role": "user",
      "content": "Current query with retrieved context..."
    }
  ],
  "system": "You are a helpful AI assistant. Use the following context to answer questions..."
}
```

**Titan Embeddings v2 Request**
```json
{
  "inputText": "Text to embed...",
  "dimensions": 1024,
  "normalize": true
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Invalid Credentials Rejection

*For any* invalid credential combination (wrong username, wrong password, or malformed input), the Authentication_Service should reject the authentication request and return an appropriate error message without generating a session token.

**Validates: Requirements 1.2**

### Property 2: Session Token Expiration

*For any* session token that has been inactive for 24 hours or more, the Authentication_Service should treat it as expired and reject any requests using that token.

**Validates: Requirements 1.3, 1.4**

### Property 3: User Message Display Immediacy

*For any* user message submitted through the Chat_Interface, the message should appear in the chat display immediately without waiting for server confirmation.

**Validates: Requirements 2.1**

### Property 4: Response Streaming

*For any* response generated by the Bedrock_Service, the Chat_Interface should receive and display tokens incrementally via WebSocket rather than waiting for the complete response.

**Validates: Requirements 2.2**

### Property 5: WebSocket Connection Persistence

*For any* active chat session, the WebSocket_Manager should maintain an open connection without unexpected disconnections during the session lifetime.

**Validates: Requirements 2.3**

### Property 6: WebSocket Reconnection

*For any* interrupted WebSocket connection, the WebSocket_Manager should attempt to re-establish the connection within 3 seconds of detecting the interruption.

**Validates: Requirements 2.4**

### Property 7: Typing Indicator Display

*For any* query being processed by the Bedrock_Service, the Chat_Interface should display a typing indicator from the moment the query is sent until the first response token is received.

**Validates: Requirements 2.5**

### Property 8: Bedrock API Invocation

*For any* user query received by the system, the Bedrock_Service should invoke the Claude 3 Sonnet model via the Amazon Bedrock API (not any other model or service).

**Validates: Requirements 3.1**

### Property 9: Retry with Exponential Backoff

*For any* API error returned by the Bedrock_Service, the Lambda_Handler should retry the request up to 3 times with exponentially increasing delays between attempts.

**Validates