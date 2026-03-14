# Nivulauta Agent

A production-ready, serverless RAG (Retrieval-Augmented Generation) chatbot system built on AWS that combines Claude Haiku 4.5 via Amazon Bedrock with semantic document search capabilities. The system provides real-time chat responses grounded in organizational knowledge from PDF documents.

## Overview

This chatbot system enables users to interact with Claude Haiku 4.5 while automatically retrieving relevant context from uploaded PDF documents. The architecture is fully serverless, leveraging AWS Lambda, API Gateway, S3, OpenSearch, and DynamoDB to achieve automatic scaling, high availability, and cost efficiency.

### Key Features

- **Real-time Chat Interface**: WebSocket-based bidirectional communication with streaming responses
- **Intelligent Document Search**: Semantic search across PDF documents using vector embeddings
- **Secure Authentication**: Session-based authentication with JWT tokens and 24-hour expiration
- **Document Management**: Upload, process, and search PDF documents up to 100MB
- **Cost Optimized**: Intelligent caching reduces API calls and keeps costs under $200/month
- **Scalable**: Supports 100+ concurrent users with sub-2-second response times
- **Comprehensive Audit Logging**: All interactions logged for compliance and security
- **Infrastructure as Code**: Complete Terraform configurations for reproducible deployments

## Architecture

### High-Level Components

```
┌─────────────────┐
│  React Frontend │ (S3 + CloudFront)
└────────┬────────┘
         │ HTTPS/WSS
┌────────▼────────┐
│  API Gateway    │ (REST + WebSocket)
└────────┬────────┘
         │
┌────────▼────────┐
│ Lambda Functions│
├─────────────────┤
│ • Auth Handler  │
│ • Chat Handler  │
│ • Upload Handler│
│ • Doc Processor │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    │         │          │          │
┌───▼───┐ ┌──▼──────┐ ┌─▼────┐ ┌──▼──────┐
│   S3  │ │DynamoDB │ │Redis │ │OpenSearch│
│(Docs) │ │(History)│ │(Cache)│ │(Vectors) │
└───────┘ └─────────┘ └──────┘ └──────────┘
                                     │
                              ┌──────▼──────┐
                              │   Bedrock   │
                              │Claude/Titan │
                              └─────────────┘
```

### Technology Stack

- **Frontend**: React 18 with TypeScript and Vite
- **Backend**: AWS Lambda (Node.js 22.x/TypeScript)
- **API Layer**: AWS API Gateway (REST + WebSocket)
- **AI/ML**: Amazon Bedrock (Claude Haiku 4.5, Titan Embeddings V2)
- **Vector Database**: Amazon OpenSearch with k-NN plugin (HNSW algorithm)
- **Storage**: Amazon S3 with KMS encryption
- **Database**: Amazon DynamoDB with on-demand pricing
- **Cache**: Amazon ElastiCache (Redis) with LRU eviction
- **Infrastructure**: Terraform (modular architecture)
- **Testing**: Vitest with property-based testing (fast-check)

## Project Structure

```
.
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── Auth.tsx           # Authentication wrapper
│   │   │   ├── Navigation.tsx     # Side navigation bar
│   │   │   ├── Home.tsx           # Landing page
│   │   │   ├── ChatView.tsx       # Chat view wrapper
│   │   │   ├── Chat.tsx           # Main chat interface
│   │   │   ├── ChatWindow.tsx     # Message display with auto-scroll
│   │   │   ├── Message.tsx        # Individual message with citations
│   │   │   ├── MessageInput.tsx   # Message input field
│   │   │   ├── DocumentsView.tsx  # Documents view wrapper
│   │   │   ├── DocumentManager.tsx # Document upload/list
│   │   │   ├── ConnectionStatus.tsx # WebSocket status
│   │   │   ├── ErrorMessage.tsx    # Error display
│   │   │   └── RateLimitError.tsx  # Rate limit handling
│   │   ├── contexts/     # React contexts
│   │   │   ├── AuthContext.tsx    # Authentication state
│   │   │   └── ChatContext.tsx    # Chat state persistence
│   │   ├── utils/        # Utility functions
│   │   │   ├── websocket.ts       # WebSocket manager with reconnection
│   │   │   ├── api.ts             # REST API client
│   │   │   ├── axios.ts           # Axios instance with interceptors
│   │   │   ├── auth.ts            # Token management utilities
│   │   │   └── errorHandler.ts    # Error parsing
│   │   ├── types/        # TypeScript types
│   │   │   ├── api.ts             # API type definitions
│   │   │   └── auth.ts            # Auth type definitions
│   │   ├── config/       # Configuration
│   │   │   └── api.ts             # API endpoints configuration
│   │   └── App.tsx       # Root component with routing
│   ├── public/           # Static assets
│   └── package.json      # Dependencies
│
├── terraform/            # Infrastructure as Code
│   ├── main.tf          # Root Terraform configuration
│   ├── variables.tf     # Input variables
│   ├── outputs.tf       # Output values
│   └── modules/         # Terraform modules
│       ├── auth/        # Authentication infrastructure
│       ├── database/    # DynamoDB tables
│       ├── networking/  # VPC, subnets, security groups
│       ├── opensearch/  # OpenSearch cluster
│       ├── rest-api/    # REST API Gateway
│       ├── security/    # IAM roles and policies
│       ├── storage/     # S3 buckets
│       ├── websocket/   # WebSocket API Gateway
│       └── ...
│
├── lambda/              # Lambda function source code
│   ├── auth/           # Authentication functions
│   │   ├── authorizer/ # JWT token validation
│   │   ├── login/      # Login endpoint
│   │   └── logout/     # Logout endpoint
│   └── websocket/      # WebSocket handlers
│       ├── connect/    # Connection handler
│       ├── disconnect/ # Disconnection handler
│       └── message/    # Message handler
│
└── .kiro/              # Project specifications
    └── specs/
        └── n-agent/
            ├── requirements.md  # Functional requirements
            ├── design.md       # Architecture design
            └── tasks.md        # Implementation tasks
```

## Current Implementation Status

**Overall Progress: 26 of 26 tasks completed (100%) ✅**

```
Infrastructure    ████████████████████ 100% (Task 1)
Authentication    ████████████████████ 100% (Task 2)
WebSocket         ████████████████████ 100% (Task 3)
Rate Limiting     ████████████████████ 100% (Task 4)
Audit Logging     ████████████████████ 100% (Task 5)
Caching           ████████████████████ 100% (Task 6)
Bedrock Service   ████████████████████ 100% (Task 7)
Embeddings        ████████████████████ 100% (Task 8)
Vector Store      ████████████████████ 100% (Task 9)
Document Pipeline ████████████████████ 100% (Tasks 10-11)
Document Upload   ████████████████████ 100% (Task 12)
RAG System        ████████████████████ 100% (Tasks 13-14)
Chat History      ████████████████████ 100% (Task 15)
Backend Tests     ████████████████████ 100% (Task 16)
Chat Handler      ████████████████████ 100% (Task 17)
Monitoring        ████████████████████ 100% (Task 18)
API Gateway       ████████████████████ 100% (Task 19)
Lambda Scaling    ████████████████████ 100% (Task 20)
Frontend          ████████████████████ 100% (Task 21)
Frontend Deploy   ████████████████████ 100% (Task 22)
Frontend Tests    ████████████████████ 100% (Task 23)
Integration Tests ████████████████████ 100% (Task 24)
Documentation     ████████████████████ 100% (Task 25)
Production Ready  ████████████████████ 100% (Task 26)
```

### ✅ Completed (Tasks 1-26)

#### **Infrastructure Foundation** (Task 1) ✓
- VPC with private subnets and NAT Gateway
- S3 buckets with encryption and versioning
- DynamoDB tables (Sessions, ChatHistory, RateLimits, DocumentMetadata, Connections)
- OpenSearch cluster with k-NN plugin
- ElastiCache Redis cluster for caching
- Security groups and IAM roles
- CloudWatch log groups with 365-day retention

#### **Authentication Service** (Task 2) ✓
- Lambda Authorizer with JWT validation and 24-hour expiration
- Login endpoint with session management
- Logout endpoint with session revocation
- Property-based tests for invalid credentials rejection
- Property-based tests for session expiration

#### **WebSocket Manager** (Task 3) ✓
- WebSocket API Gateway with $connect, $disconnect, and chat_message routes
- Connection/disconnection handlers with DynamoDB persistence
- Message sender utility with error handling for stale connections
- Support for multiple message types (chat_response, typing_indicator, error, system)
- Property-based tests for connection persistence and reconnection

#### **Rate Limiter** (Task 4) ✓
- Sliding window algorithm using DynamoDB atomic counters
- 60 requests/min for regular users, 300 for admins
- HTTP 429 responses with Retry-After headers
- Automatic counter reset with DynamoDB TTL
- Comprehensive unit tests for rate limiting patterns

#### **Audit Logger** (Task 5) ✓
- Structured JSON logging utility for CloudWatch
- Event logging (user actions, API calls, document operations)
- Separate log groups by event type
- CloudWatch Logs Insights queries for common scenarios
- Unit tests for audit logging

#### **Cache Layer with ElastiCache Redis** (Task 6) ✓
- Redis cluster deployment with Terraform (1GB max memory)
- Cache utility module with LRU eviction policy
- Response caching with SHA-256 query hashing (1 hour TTL)
- Search result caching with embedding hashing (15 minutes TTL)
- Graceful error handling for cache misses
- Unit tests for cache operations

#### **Bedrock Service Integration** (Task 7) ✓
- Claude Haiku 4.5 client wrapper via global inference profile
- Streaming support via InvokeModelWithResponseStream
- Non-streaming generateResponseSync for batch operations
- Model parameters: max_tokens=2048, temperature=0.7 (no top_p for compatibility)
- Retry logic with exponential backoff (3 attempts: 1s, 2s, 4s delays)
- Throttling error handling (ThrottlingException)
- Conversation context management (last 10 messages, sliding window)
- Property-based tests for API invocation and retry behavior
- Unit tests for streaming, error handling, and context formatting

#### **Embedding Generator with Bedrock Titan** (Task 8) ✓
- Titan Embeddings V2 client (amazon.titan-embed-text-v2:0)
- Single text embedding generation (1024 dimensions)
- Batch processing with batch size of 25
- Parallel batch processing using Promise.all
- Rate limiting with retry logic
- Progress tracking for large document sets
- Unit tests for embedding generation and batch processing

#### **Vector Store with OpenSearch** (Task 9) ✓
- OpenSearch index with k-NN configuration (1024 dimensions, cosine similarity)
- HNSW parameters: ef_construction=512, m=16, ef_search=512
- 5-second refresh interval for near-real-time search
- OpenSearch client wrapper with VPC endpoint
- Single and bulk embedding indexing
- k-NN similarity search with configurable k
- Metadata filtering (documentIds, dateRange, custom metadata)
- Document deletion (removes all chunks)
- Comprehensive unit tests (29 tests covering indexing, search, filtering, edge cases)

#### **Document Processor Lambda** (Task 10) ✓
- PDF text extraction using pdfplumber with complex layout support
- Table detection and extraction
- Page-by-page text extraction with metadata
- Token-based chunking (512 tokens, 50 token overlap) using tiktoken
- Unique chunk ID generation (documentId#chunk#index)
- S3 event trigger for automatic processing on upload
- Outputs: text.json, pages.json, chunks.json
- Lambda Layer architecture with Docker build for dependencies
- Comprehensive unit tests (48 tests covering extraction, chunking, error handling)
- Terraform module with SNS notifications for failures

#### **Document Processing Orchestration** (Task 11) ✓
- Document Processor → Embedding Generator integration
  - Asynchronous Lambda invocation after text extraction and chunking
  - Passes text chunks with full metadata (documentId, filename, pageNumber, uploadedBy, uploadedAt)
- Embedding Generator → Vector Store integration
  - Downloads chunks from S3
  - Generates embeddings using Bedrock Titan (1024 dimensions)
  - Batch indexes embeddings in OpenSearch with metadata
  - Updates DocumentMetadata table with completion status (chunkCount, status=completed)
- End-to-end integration tests
  - Test suite validates complete pipeline: upload → extract → chunk → embed → index
  - Verifies document searchability after processing
  - Tests chunking overlap, concurrent processing, and error handling
  - 5 comprehensive test cases covering all pipeline stages
- Complete pipeline flow: PDF Upload → Extract Text → Chunk (512 tokens, 50 overlap) → Generate Embeddings → Index in OpenSearch → Update Metadata → Document Searchable

#### **Document Upload Management** (Task 12) ✓
- Document upload Lambda with presigned URL generation
- Document list endpoint with pagination and filtering
- Document delete endpoint with cascade deletion (S3, OpenSearch, DynamoDB)
- Comprehensive unit tests with Vitest (58 tests)
- Integration with document processor pipeline

#### **RAG System & Query Routing** (Tasks 13-14) ✓
- Query classification using keyword-based classifier
- RAG system with context retrieval and assembly
- Dynamic k selection for search results (default: 5)
- Cache integration for query embeddings and search results
- Circuit breaker pattern for external service resilience
- Context assembly with citations and source attribution
- System prompt generation with/without context
- Conversation history management with sliding window
- Token counting and context size management
- Comprehensive unit tests (35+ tests covering retrieval, caching, circuit breaker)

#### **Chat History Management** (Task 15) ✓
- Chat history persistence with DynamoDB
- History retrieval with pagination (default: 50 messages)
- Session-based history organization
- KMS encryption for sensitive data
- Comprehensive unit tests (25 tests covering persistence, retrieval, pagination)

#### **Notification System** (Task 16) ✓
- SNS topics for system alerts, operational notifications, and failed processing
- Topic policies for cross-service publishing
- CloudWatch alarm integration
- Terraform module for notification infrastructure

#### **Main Chat Handler** (Task 17) ✓
- WebSocket chat message processing with full pipeline integration
- Rate limiting enforcement (60 requests/min)
- RAG retrieval with fallback to direct LLM
- Streaming response delivery to WebSocket clients
- Response caching with Redis
- Chat history persistence after each interaction
- Circuit breaker for Bedrock and OpenSearch
- Comprehensive error handling and user feedback
- Audit logging for all chat interactions
- Integration tests (58 tests covering end-to-end flow, RAG, caching, error handling)

#### **Performance Monitoring & Metrics** (Task 18) ✓
- CloudWatch metrics emission for all Lambda invocations
- Custom metrics: query_latency, embedding_generation_time, search_latency
- Bedrock token usage metrics (input_tokens, output_tokens)
- OpenSearch query latency tracking
- CloudWatch dashboard with key performance indicators (request rate, error rate, latency percentiles, token usage, cache hit rate, concurrent users)
- CloudWatch alarms for response time > 2s, error rate > 5%, Bedrock throttling
- SNS notifications for alarm triggers
- Unit tests for metrics emission

#### **REST API Gateway Configuration** (Task 19) ✓
- REST API Gateway with resources: /auth, /documents, /chat
- Lambda integrations for all endpoints
- CORS configuration for browser access
- Request/response models and validation
- API Gateway throttling (burst=100, rate=50 req/s)
- AWS WAF with rate-based rules
- CloudWatch logging for API Gateway audit trail

#### **Lambda Concurrency & Scaling** (Task 20) ✓
- Reserved concurrency for WebSocket handler (100 concurrent connections)
- Provisioned concurrency for latency-sensitive functions
- Memory allocation: 1024MB for API handlers, 3008MB for document processing
- Timeouts: 30s for API handlers, 300s for document processing
- VPC networking for Lambda → OpenSearch communication
- NAT Gateway for outbound Bedrock API calls
- Load tests for 100 concurrent WebSocket connections and chat requests

#### **Frontend React Application** (Task 21) ✓
- React 18 with TypeScript and Vite build system
- Material-UI component library for consistent design
- Authentication components with login/logout
  - Session token management with localStorage
  - Automatic token refresh logic
  - Post-login delay (500ms) to prevent WebSocket race conditions
  - Session timeout detection with automatic logout
- Navigation system
  - Side navigation bar with Home, Chat, and Documents views
  - Persistent navigation state across route changes
  - Responsive design (collapsible on mobile, permanent on desktop)
  - Active route highlighting
- WebSocket connection manager
  - Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s)
  - Smart retry logic for initial connection failures (300ms delay on first connect)
  - Connection state management (connecting, connected, disconnected, error)
  - Keep-alive ping every 5 minutes
  - Token update detection and automatic reconnection
  - Session expiration handling with user notification
- Chat interface with streaming responses
  - Real-time message streaming with in-place updates (no flicker)
  - Smooth auto-scrolling during streaming (requestAnimationFrame optimization)
  - User messages scroll to top of viewport to keep responses visible
  - Typing indicator while waiting for responses
  - Optimistic UI updates for user messages
  - RAG source citations with expandable "View Sources" button
  - Markdown rendering for assistant responses with syntax highlighting
  - Chat state persistence across navigation (messages preserved when switching views)
- Document management UI
  - File upload with drag-and-drop support
  - PDF validation (type and size checks up to 100MB)
  - Upload progress tracking with presigned URLs
  - Document list with metadata display
  - Document deletion with confirmation
- Error handling and user feedback
  - Rate limit errors with countdown timer
  - Connection status indicators with reconnection attempt tracking
  - Session expiration notifications
  - Graceful error messages with retry options
  - Auto-dismissing success notifications
- Responsive design with CSS Grid/Flexbox and Material-UI breakpoints
- Component architecture: Auth, Navigation, Home, ChatView, Chat, ChatWindow, Message, MessageInput, DocumentsView, DocumentManager, ConnectionStatus, ErrorMessage, RateLimitError
- Context providers: AuthContext (authentication state), ChatContext (chat state persistence)

#### **Frontend Deployment to S3 & CloudFront** (Task 22) ✓
- S3 bucket for static website hosting with versioning
- CloudFront distribution with S3 origin
- HTTPS with ACM certificate
- Caching behavior for static assets (CSS, JS, images)
- Custom domain configuration support
- Deployment script for production builds
- CloudFront cache invalidation after deployment
- Terraform module for frontend infrastructure

#### **Frontend Integration Checkpoint** (Task 23) ✓
- Frontend successfully integrates with backend APIs
- WebSocket connections established and maintained
- Authentication flow working end-to-end
- Document upload and management functional
- Chat interface with streaming responses operational
- All frontend tests passing

#### **End-to-End Integration & Testing** (Task 24) ✓
- **Integration Test Suite** (lambda/tests/integration/)
  - E2E user flow tests: login → upload → process → query with RAG
  - Document search results verification after processing
  - Chat responses with document citations validation
  - WebSocket connection stability over extended sessions (30s+)
  - 5 comprehensive test scenarios covering full user journey

- **Error Resilience Testing**
  - OpenSearch unavailable fallback to direct LLM (Requirement 14.2)
  - Bedrock throttling with retry and exponential backoff (Requirement 14.3)
  - Document processing failures with dead-letter queue (Requirement 14.3)
  - Circuit breaker activation after 5 consecutive failures (Requirement 14.4)
  - Graceful degradation with reduced functionality (Requirement 14.5)
  - 5 test scenarios validating error handling and resilience

- **Security Configuration Verification**
  - S3 bucket encryption validation (server-side encryption enabled)
  - DynamoDB table encryption verification
  - IAM role least privilege validation
  - API Gateway authentication requirements
  - TLS 1.2+ configuration for data in transit
  - Lambda Authorizer configuration on WebSocket API
  - 6 security test scenarios

- **Audit Logging Verification**
  - User action logging with required fields (userId, action, timestamp, IP)
  - Document operation logging (upload, delete, process)
  - Bedrock API call logging with token counts
  - 365-day log retention configuration
  - 4 audit logging test scenarios

- **Load Testing for Concurrent Users** (Task 20.3)
  - 100 concurrent WebSocket connections (Requirement 9.1)
  - Vector Store query performance under load (Requirement 9.3)
  - 100 simultaneous WebSocket connections without degradation (Requirement 9.4)
  - 50 concurrent chat requests with response time validation (Requirement 9.5)
  - Performance metrics: P50, P95, P99 response times
  - Success rate validation (≥80% for connections, ≥70% under 2s for responses)
  - Graceful degradation when chat handler Lambda not deployed
  - Comprehensive diagnostics and troubleshooting guidance

- **Test Infrastructure**
  - Automatic configuration loading from Terraform outputs
  - Environment variable fallback for manual configuration
  - JWT token generation for authentication testing
  - Test data cleanup in afterAll hooks
  - Detailed logging and diagnostics for debugging
  - 50+ integration tests across all test suites

#### **Deployment Documentation & Runbooks** (Task 25) ✓
- Infrastructure deployment process documentation (terraform/README.md)
- Operational procedures and runbooks (docs/OPERATIONS_RUNBOOK.md)
- Monitoring and alerting guide with CloudWatch dashboard walkthrough
- Failed document processing investigation procedures
- Resource scaling procedures for increased load
- Cost optimization strategies (docs/COST_OPTIMIZATION.md)
- Expected monthly costs for various usage levels ($95-$475/month)

#### **Final Production Readiness Checkpoint** (Task 26) ✓
- All test suites passing across the entire codebase
- Jest-based tests migrated to Vitest for consistency
- Test fixes applied: mock wiring corrections, timeout adjustments, async generator error handling
- All 26 implementation tasks verified complete

**Progress: 26 of 26 tasks completed (100%)**



See [tasks.md](.kiro/specs/n-agent/tasks.md) for the complete implementation plan with detailed subtasks.

## Getting Started

### Prerequisites

- AWS Account with appropriate permissions
- Terraform >= 1.0
- Node.js >= 22.x
- AWS CLI configured with credentials

### Deployment

1. **Clone the repository**
   ```bash
   git clone https://github.com/Nivulauta/n-agent
   cd n-agent
   ```

2. **Configure Terraform variables**
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your configuration
   ```

3. **Deploy infrastructure**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

4. **Build and deploy Lambda functions**
   ```bash
   cd ../lambda/auth/authorizer
   npm install
   npm run build
   
   cd ../login
   npm install
   npm run build
   
   # Repeat for other Lambda functions
   ```

5. **Update Lambda function code**
   ```bash
   cd ../../terraform
   terraform apply  # Redeploy with updated function code
   ```

6. **Build and run frontend locally**
   ```bash
   cd ../frontend
   npm install
   npm run dev  # Starts development server on http://localhost:5173
   ```

7. **Configure frontend environment**
   ```bash
   # Create .env file with API endpoints from Terraform outputs
   VITE_REST_API_URL=<rest_api_url>
   VITE_WEBSOCKET_URL=<websocket_url>
   ```

### Testing

Run tests for individual components:

```bash
# Integration tests (comprehensive test suite)
cd lambda/tests/integration
npm install
npm test

# Specific integration test suites
npm test e2e-user-flow.test.ts              # End-to-end user flow
npm test error-resilience.test.ts           # Error handling and resilience
npm test security-verification.test.ts      # Security configuration
npm test audit-logging-verification.test.ts # Audit logging
npm test load-concurrent-users.test.ts      # Load testing for 100 concurrent users

# Frontend tests
cd frontend
npm test

# Authentication tests
cd lambda/auth/login
npm test

# WebSocket tests
cd lambda/websocket/connect
npm test

# Bedrock Service tests
cd lambda/shared/bedrock
npm test

# Embedding Generator tests
cd lambda/shared/embeddings
npm test

# Vector Store tests
cd lambda/shared/vector-store
npm test

# Rate Limiter tests
cd lambda/shared/rate-limiter
npm test

# Document Processor tests
cd lambda/document-processor
npm test

# RAG System tests
cd lambda/shared/rag
npm test
```

### Integration Test Guides

Comprehensive guides for running and troubleshooting integration tests:

- [E2E Test Guide](docs/tutorials/E2E_TEST_GUIDE.md) - End-to-end user flow testing
- [Error Resilience Guide](docs/tutorials/ERROR_RESILIENCE_TEST_GUIDE.md) - Error handling validation
- [Load Test Guide](docs/tutorials/LOAD_TEST_GUIDE.md) - Concurrent user load testing
- [Integration Tests README](lambda/tests/integration/README.md) - Overview and configuration

## Configuration

### Environment Variables

Lambda functions use the following environment variables (configured via Terraform):

- `DYNAMODB_SESSIONS_TABLE`: DynamoDB table for user sessions
- `DYNAMODB_CONNECTIONS_TABLE`: DynamoDB table for WebSocket connections
- `DYNAMODB_CHAT_HISTORY_TABLE`: DynamoDB table for chat history
- `DYNAMODB_RATE_LIMITS_TABLE`: DynamoDB table for rate limiting
- `DYNAMODB_DOCUMENT_METADATA_TABLE`: DynamoDB table for document metadata
- `S3_DOCUMENTS_BUCKET`: S3 bucket for PDF documents
- `OPENSEARCH_ENDPOINT`: OpenSearch cluster endpoint
- `JWT_SECRET`: Secret key for JWT token signing (stored in Secrets Manager)

### Terraform Variables

Key Terraform variables (see `terraform/variables.tf`):

- `aws_region`: AWS region for deployment (default: us-east-1)
- `environment`: Environment name (dev/staging/prod)
- `project_name`: Project name prefix for resources
- `opensearch_instance_type`: OpenSearch instance type (default: t3.medium.search)
- `lambda_memory_size`: Memory allocation for Lambda functions

## Security

### Authentication & Authorization

- JWT-based session tokens with 24-hour expiration
- Lambda Authorizer validates all API requests
- IAM roles follow least privilege principle

### Encryption

- **At Rest**: All data encrypted using AWS KMS
  - S3 buckets with server-side encryption
  - DynamoDB tables with encryption enabled
  - OpenSearch with encryption at rest
- **In Transit**: TLS 1.2+ for all communications

### Network Security

- Lambda functions in private subnets
- Security groups restrict traffic to necessary ports
- VPC endpoints for AWS service communication
- NAT Gateway for controlled outbound access

### Audit & Compliance

- All user actions logged to CloudWatch
- 365-day log retention for compliance
- Structured JSON logging format
- Tamper-evident log storage

## Cost Optimization

### Caching Strategy

- Response caching: 1 hour for identical queries
- Search result caching: 15 minutes for identical embeddings
- Target cache hit rate: 30%+

### Resource Optimization

- Lambda memory tuning based on workload
- DynamoDB on-demand pricing for variable load
- S3 Intelligent-Tiering for older documents
- OpenSearch right-sized for workload

### Expected Costs (Moderate Usage)

- Lambda: ~$50/month
- OpenSearch: ~$70/month
- Bedrock API: ~$40/month
- DynamoDB: ~$20/month
- S3 + Data Transfer: ~$10/month
- **Total: ~$190/month**

## Performance

### Target Metrics

- Response time (no RAG): < 2 seconds
- Response time (with RAG): < 2 seconds
- Vector search latency: < 200ms
- Document processing: < 30 seconds (10MB PDF)
- Concurrent users: 100+
- WebSocket connections: 100+

### Monitoring

CloudWatch dashboards track:
- Request rate and error rate
- Response time percentiles (p50, p95, p99)
- Bedrock token usage and costs
- Cache hit rates
- Concurrent connections

## Testing Strategy

### Integration Testing

Comprehensive integration test suite validates the complete system:

- **E2E User Flow Tests** (lambda/tests/integration/e2e-user-flow.test.ts)
  - Complete user journey: login → upload → process → query with RAG
  - Document searchability verification after processing
  - Chat responses with document citations
  - WebSocket connection stability over extended sessions
  - 5 test scenarios covering Requirements 2.3, 4.3, 5.1, 7.1, 7.4

- **Error Resilience Tests** (lambda/tests/integration/error-resilience.test.ts)
  - OpenSearch unavailable fallback (Requirement 14.2)
  - Bedrock throttling with retry (Requirement 14.3)
  - Document processing failures (Requirement 14.3)
  - Circuit breaker activation (Requirement 14.4)
  - Graceful degradation (Requirement 14.5)
  - 5 test scenarios validating error handling

- **Security Verification Tests** (lambda/tests/integration/security-verification.test.ts)
  - S3 encryption validation
  - DynamoDB encryption verification
  - IAM least privilege validation
  - API Gateway authentication
  - TLS configuration
  - 6 security test scenarios

- **Audit Logging Tests** (lambda/tests/integration/audit-logging-verification.test.ts)
  - User action logging
  - Document operation logging
  - Bedrock API call logging
  - Log retention validation
  - 4 audit logging test scenarios

- **Load Tests** (lambda/tests/integration/load-concurrent-users.test.ts)
  - 100 concurrent WebSocket connections (Requirement 9.1)
  - Vector Store query performance (Requirement 9.3)
  - Connection capacity without degradation (Requirement 9.4)
  - 50 concurrent chat requests (Requirement 9.5)
  - Response time validation (P50, P95, P99)
  - 4 load test scenarios

### Property-Based Testing

The project uses property-based testing with fast-check to validate universal correctness properties:

- **Property 1**: Invalid credentials always rejected without generating session tokens (Authentication)
- **Property 2**: Session tokens expire after 24 hours of inactivity (Authentication)
- **Property 3**: User messages display immediately on submission (Frontend)
- **Property 4**: Response streaming delivers tokens incrementally (Frontend)
- **Property 5**: WebSocket connections persist correctly with proper metadata (WebSocket)
- **Property 6**: WebSocket reconnection handles interrupted connections reliably (WebSocket)
- **Property 7**: Typing indicator displays regardless of query content (Frontend)
- **Property 8**: Bedrock API invocation succeeds for valid requests with correct model (Bedrock)
- **Property 9**: Retry with exponential backoff follows correct timing intervals (Bedrock)

### Unit Testing

- Vitest for all unit tests (migrated from Jest for consistency)
- AWS SDK mocking with aws-sdk-client-mock and vitest mocks
- Property-based testing with fast-check across auth, WebSocket, and Bedrock modules
- 29 tests for Vector Store (indexing, search, filtering)
- 52 tests for Bedrock Service (streaming, retry, context, property tests)
- 23 tests for Embedding Generator (batch processing, dimensions)
- 48 tests for Document Processor (extraction, chunking, error handling)
- 32 tests for Query Router (classification, confidence, k selection)
- 38 tests for RAG System (retrieval, caching, circuit breaker)
- 25 tests for Cache Layer (hit/miss, TTL, error handling)
- 21 tests for Audit Logger (JSON structure, log routing, field presence)
- 30 tests for Rate Limiter (sliding window, counter reset, admin limits)
- 15 tests for Circuit Breaker (state transitions, thresholds)
- 43 tests for Metrics (data structure, values calculation)
- 10 tests for Chat History shared module (persistence, retrieval)
- 58 tests for Chat Handler (end-to-end flow, RAG, caching, error handling)
- 24 tests for Document Upload (presigned URLs, validation)
- 6 tests for Document Delete (authorization, cascade deletion)
- 11 tests for Auth Login (property tests for credentials, session expiration)
- 18 tests for WebSocket Connect (property tests for persistence, reconnection)
- 8 tests for Chat History Lambda (handler, pagination, CORS)
- 10 tests for Frontend (property tests for message display, streaming, typing indicator)
- 9 tests for Vector Store Init (index creation)
- High coverage for business logic and edge cases

### Test Configuration

Integration tests automatically load configuration from Terraform outputs:

```bash
cd lambda/tests/integration
npm install

# Tests auto-load from terraform output
npm test

# Or set environment variables manually
export AWS_REGION=us-east-2
export DOCUMENTS_BUCKET=chatbot-documents-dev
export SESSIONS_TABLE=chatbot-sessions
export JWT_SECRET=your-secret-key
npm test
```

See [Integration Tests README](lambda/tests/integration/README.md) for detailed configuration and troubleshooting.

### Integration Testing (Completed)

- ✅ End-to-end flow testing (login → upload → process → search → chat)
- ✅ Document upload → processing → search → chat validation
- ✅ Error scenario testing (OpenSearch unavailable, Bedrock throttling, processing failures)
- ✅ Security configuration verification (encryption, IAM, authentication)
- ✅ Audit logging completeness validation
- ✅ Load testing for 100 concurrent users with performance metrics
- ✅ 50+ integration tests across all test suites
- ✅ Automatic configuration loading from Terraform outputs
- ✅ Comprehensive test guides and troubleshooting documentation

## Contributing

This project follows a spec-driven development approach:

1. Requirements defined in `requirements.md`
2. Architecture designed in `design.md`
3. Implementation tasks tracked in `tasks.md`
4. Code implements tasks with tests

## Documentation

- [Requirements Document](.kiro/specs/n-agent/requirements.md) - Functional requirements
- [Design Document](.kiro/specs/n-agent/design.md) - Architecture and design decisions
- [Implementation Tasks](.kiro/specs/n-agent/tasks.md) - Development roadmap
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md) - Monitoring, alerting, and incident response
- [Cost Optimization](docs/COST_OPTIMIZATION.md) - Cost strategies and monthly estimates
- [Documentation Index](docs/README.md) - Comprehensive documentation

## License

[LICENSE](LICENSE.md)

## Support

For questions or issues, please [open an issue](link-to-issues) or contact the development team.
