# AWS Claude RAG Agent

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
- **Backend**: AWS Lambda (Node.js 18.x/TypeScript)
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
        └── aws-claude-rag-chatbot/
            ├── requirements.md  # Functional requirements
            ├── design.md       # Architecture design
            └── tasks.md        # Implementation tasks
```

## Current Implementation Status

**Overall Progress: 19 of 26 tasks completed (73%)**

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
Notifications     ████████████████████ 100% (Task 16)
Chat Handler      ████████████████████ 100% (Task 17)
Frontend          ████████████████████ 100% (Task 21)
Integration       ░░░░░░░░░░░░░░░░░░░░   0% (Task 24)
```

### ✅ Completed (Tasks 1-17)

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

### 📋 Planned (Tasks 18-20, 22-26)

#### **Performance Monitoring** (Task 18)
- CloudWatch metrics emission
- Custom metrics (query latency, token usage, search latency)
- CloudWatch dashboard with key metrics
- Alarms for response time and error rate

#### **API Gateway & Lambda Configuration** (Tasks 19-20)
- REST API Gateway with CORS
- API Gateway throttling and WAF
- Lambda concurrency limits and provisioned concurrency
- VPC networking for Lambda functions

#### **Frontend Deployment** (Task 22)
- S3 + CloudFront deployment
- Custom domain with SSL/TLS
- CI/CD pipeline for frontend updates

#### **Integration & Testing** (Tasks 24-25)
- End-to-end integration tests
- Error scenario and resilience testing
- Security configuration verification
- Performance benchmarks
- Deployment documentation and runbooks

#### **Production Readiness** (Task 26)
- Disaster recovery procedures
- Backup and restore testing
- Cost optimization review
- Security audit
- Documentation finalization

**Progress: 19 of 26 tasks completed (73%)**

See [tasks.md](.kiro/specs/aws-claude-rag-agent/tasks.md) for the complete implementation plan with detailed subtasks.

## Getting Started

### Prerequisites

- AWS Account with appropriate permissions
- Terraform >= 1.0
- Node.js >= 18.x
- AWS CLI configured with credentials

### Deployment

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd aws-claude-rag-chatbot
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
```

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

### Property-Based Testing

The project uses property-based testing with fast-check to validate universal correctness properties:

- **Property 1**: Invalid credentials always rejected (Authentication)
- **Property 2**: Session tokens expire after 24 hours (Authentication)
- **Property 5**: WebSocket connections persist correctly (WebSocket)
- **Property 6**: WebSocket reconnection works reliably (WebSocket)
- **Property 8**: Bedrock API invocation succeeds for valid requests (Bedrock)
- **Property 9**: Retry with exponential backoff follows correct timing (Bedrock)

### Unit Testing

- Vitest for unit tests with comprehensive coverage
- AWS SDK mocking with vitest mocks
- 29 tests for Vector Store (indexing, search, filtering)
- 20+ tests for Bedrock Service (streaming, retry, context)
- 15+ tests for Embedding Generator (batch processing, dimensions)
- High coverage for business logic and edge cases

### Integration Testing (Planned)

- End-to-end flow testing
- Document upload → processing → search → chat
- Error scenario testing
- Load testing for concurrent users

## Contributing

This project follows a spec-driven development approach:

1. Requirements defined in `requirements.md`
2. Architecture designed in `design.md`
3. Implementation tasks tracked in `tasks.md`
4. Code implements tasks with tests

## Documentation

- [Requirements Document](.kiro/specs/aws-claude-rag-agent/requirements.md) - Functional requirements
- [Design Document](.kiro/specs/aws-claude-rag-agent/design.md) - Architecture and design decisions
- [Implementation Tasks](.kiro/specs/aws-claude-rag-agent/tasks.md) - Development roadmap
- [Terraform Deployment](terraform/DEPLOYMENT.md) - Infrastructure deployment guide
- [Lambda Build Guide](lambda/auth/BUILD.md) - Lambda function build instructions

## License

[LICENSE](LICENSE.md)

## Support

For questions or issues, please [open an issue](link-to-issues) or contact the development team.
