# Context Assembly Usage Guide

This guide demonstrates how to use the `assembleContext` method to format retrieved document chunks and conversation history for Claude 3 Sonnet.

## Overview

The `assembleContext` method takes retrieved document chunks and conversation history, then formats them into a structured prompt that:
1. Includes document citations (filename, page number)
2. Combines chunks with conversation history
3. Creates a system prompt instructing Claude to use the provided context
4. Limits total context to fit within Claude's 200k token context window

## Basic Usage

```typescript
import { RAGSystem } from './rag';
import type { ConversationMessage } from './types';

// Initialize RAG system
const rag = new RAGSystem({
    region: 'us-east-1',
    opensearchEndpoint: 'https://your-opensearch-endpoint.com',
    cacheHost: 'your-redis-host',
    cachePort: 6379,
});

await rag.initialize();

// Retrieve relevant chunks
const query = "What are the security requirements?";
const retrievalResult = await rag.retrieveContext(query, { k: 5 });

// Prepare conversation history
const conversationHistory: ConversationMessage[] = [
    { role: 'user', content: 'Hello, I need help with the documentation' },
    { role: 'assistant', content: 'I\'d be happy to help! What would you like to know?' },
];

// Assemble context for LLM
const assembledContext = rag.assembleContext(
    query,
    retrievalResult.chunks,
    conversationHistory
);

// Use with Bedrock Service
import { BedrockService } from '../../bedrock';

const bedrock = new BedrockService({ region: 'us-east-1' });

const response = bedrock.generateResponse({
    prompt: assembledContext.userPrompt,
    systemPrompt: assembledContext.systemPrompt,
    conversationHistory: assembledContext.conversationHistory,
});

for await (const chunk of response) {
    if (!chunk.isComplete) {
        console.log(chunk.text);
    }
}
```

## Advanced Options

### Custom Token Limits

```typescript
const assembledContext = rag.assembleContext(
    query,
    retrievalResult.chunks,
    conversationHistory,
    {
        maxContextTokens: 150000, // Reduce from default 180k
        conversationWindowSize: 5, // Only include last 5 messages
        includeChunkScores: true,  // Show relevance scores in citations
    }
);
```

### Without Conversation History

```typescript
// For first message or when history isn't needed
const assembledContext = rag.assembleContext(
    query,
    retrievalResult.chunks,
    [] // Empty conversation history
);
```

### Without Retrieved Context (Direct LLM)

```typescript
// When query doesn't require document retrieval
const assembledContext = rag.assembleContext(
    query,
    [], // No chunks
    conversationHistory
);

// System prompt will be adjusted for general conversation
```

## Output Format

The `assembleContext` method returns an `AssembledContext` object:

```typescript
interface AssembledContext {
    systemPrompt: string;        // Instructions for Claude
    userPrompt: string;          // Query with formatted context
    conversationHistory: ConversationMessage[]; // Limited history
    totalTokens: number;         // Estimated token count
    truncated: boolean;          // Whether context was truncated
}
```

### Example System Prompt (with context)

```
You are a helpful AI assistant with access to a knowledge base of documents. 

When answering questions:
1. Use the provided document context to give accurate, well-sourced answers
2. Cite specific documents and page numbers when referencing information (e.g., "According to [Document Name, Page X]...")
3. If the context doesn't contain relevant information, acknowledge this and provide a general response based on your knowledge
4. Be concise but thorough in your responses
5. If multiple documents provide relevant information, synthesize them coherently

The document context will be provided in the user's message with citations in the format: [N] Document Name, Page X
```

### Example User Prompt (with context)

```
Context from knowledge base:

[1] Security Requirements.pdf, Page 5
All user authentication must use JWT tokens with 24-hour expiration...

---

[2] Architecture Design.pdf, Page 12
The system implements encryption at rest using AWS KMS...

---

User question: What are the security requirements?
```

## Context Truncation Strategy

If the assembled context exceeds the token limit, the system applies these strategies in order:

1. **Reduce conversation history**: Keep only last 5 messages instead of 10
2. **Reduce chunks**: Keep only top 3 chunks instead of all retrieved
3. **Remove conversation history**: Remove history entirely, keep only chunks and query

The `truncated` flag will be `true` if any truncation occurred.

## Token Estimation

The system uses a rough approximation for token counting:
- 1 token ≈ 4 characters
- Adds 20% buffer for formatting and special tokens

For production use with strict token limits, consider integrating a proper tokenizer like `tiktoken`.

## Requirements

This implementation satisfies Requirement 7.4:
- ✅ Format retrieved chunks with document citations (filename, page number)
- ✅ Combine chunks with conversation history
- ✅ Create system prompt instructing Claude to use provided context
- ✅ Limit total context to fit within Claude's context window
