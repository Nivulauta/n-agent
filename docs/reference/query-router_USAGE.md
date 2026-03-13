# Query Router Usage Guide

## Overview

The Query Router module classifies user queries to determine if RAG (Retrieval-Augmented Generation) retrieval is needed or if a direct LLM response is sufficient.

## Features

- **Heuristic Classification**: Fast, rule-based classification using patterns and keywords
- **Claude Fallback**: For ambiguous queries (confidence < 0.7), uses Claude via Bedrock for more accurate classification
- **Conversation Context**: Considers previous messages for better classification decisions

## Basic Usage

### Heuristic Classification Only

```typescript
import { classifyQuery } from '@chatbot/query-router';

const result = classifyQuery('What is in the uploaded document?');

console.log(result);
// {
//   requiresRetrieval: true,
//   confidence: 0.95,
//   reasoning: '1 document keyword(s) found, question pattern detected',
//   suggestedK: 5
// }
```

### With Claude Fallback

```typescript
import { classifyQueryWithFallback } from '@chatbot/query-router';
import { BedrockService } from '@chatbot/bedrock';

// Create Bedrock service instance
const bedrockService = new BedrockService({
    region: 'us-east-1',
    maxTokens: 256,
    temperature: 0.3
});

// Classify with fallback
const result = await classifyQueryWithFallback(
    'Can you help me understand this?',
    [],  // conversation context
    bedrockService
);

console.log(result);
// If heuristic confidence < 0.7, Claude will be used for classification
```

### With Conversation Context

```typescript
import { classifyQueryWithFallback, Message } from '@chatbot/query-router';

const conversationContext: Message[] = [
    { role: 'user', content: 'What does the document say about pricing?' },
    { role: 'assistant', content: 'According to the document, pricing starts at $99/month...' },
    { role: 'user', content: 'What about the enterprise plan?' }
];

const result = await classifyQueryWithFallback(
    'What about the enterprise plan?',
    conversationContext,
    bedrockService
);

// The classifier will recognize this as a follow-up to a document-related conversation
```

## Direct Claude Classification

You can also use Claude classification directly:

```typescript
import { classifyWithClaude } from '@chatbot/query-router';

const result = await classifyWithClaude(
    'Tell me about machine learning',
    [],
    bedrockService
);
```

## Classification Result

The `QueryClassification` object contains:

```typescript
interface QueryClassification {
    /** Whether RAG retrieval is required for this query */
    requiresRetrieval: boolean;

    /** Confidence score (0.0 to 1.0) */
    confidence: number;

    /** Reasoning for the classification decision */
    reasoning: string;

    /** Suggested number of documents to retrieve (k) */
    suggestedK: number;
}
```

## Confidence Threshold

The fallback mechanism uses a confidence threshold of **0.7**:

- **confidence >= 0.7**: Heuristic result is used (fast, no API call)
- **confidence < 0.7**: Claude is consulted for better accuracy (requires Bedrock API call)

## Error Handling

If Claude classification fails, the system gracefully falls back to the heuristic result:

```typescript
const result = await classifyQueryWithFallback(query, context, bedrockService);
// Even if Claude fails, you'll get a valid classification result
// The reasoning field will indicate if fallback was used
```

## Integration with Chat Handler

Example integration in a Lambda chat handler:

```typescript
import { classifyQueryWithFallback } from '@chatbot/query-router';
import { BedrockService } from '@chatbot/bedrock';
import { RAGSystem } from '@chatbot/rag';

const bedrockService = new BedrockService();
const ragSystem = new RAGSystem();

export async function handleChatMessage(query: string, conversationHistory: Message[]) {
    // Classify the query
    const classification = await classifyQueryWithFallback(
        query,
        conversationHistory,
        bedrockService
    );

    let context = '';
    
    // If retrieval is needed, fetch relevant documents
    if (classification.requiresRetrieval) {
        const chunks = await ragSystem.retrieveContext(
            query,
            classification.suggestedK
        );
        context = formatChunksForPrompt(chunks);
    }

    // Generate response with or without RAG context
    const response = await bedrockService.generateResponse({
        prompt: query,
        systemPrompt: context ? `Use this context: ${context}` : undefined,
        conversationHistory
    });

    return response;
}
```

## Testing

For testing, you can provide a mock Bedrock service:

```typescript
import { BedrockClassifierService } from '@chatbot/query-router';

const mockBedrockService: BedrockClassifierService = {
    async generateResponseSync(request) {
        return JSON.stringify({
            requiresRetrieval: true,
            confidence: 0.9,
            reasoning: 'Test classification'
        });
    }
};

const result = await classifyWithClaude(
    'test query',
    [],
    mockBedrockService
);
```

## Performance Considerations

- **Heuristic classification**: < 1ms, no API calls
- **Claude fallback**: ~200-500ms, requires Bedrock API call
- **Cost**: Claude fallback costs ~$0.003 per classification (256 tokens)

The system is designed to minimize Claude usage by only invoking it for ambiguous queries, keeping costs low while maintaining high accuracy.
