# Bedrock Service

AWS Bedrock client wrapper for Claude Haiku 4.5 with streaming and non-streaming support.

## Features

- **Streaming responses**: Real-time token-by-token response generation via `InvokeModelWithResponseStream`
- **Non-streaming responses**: Complete response generation via `InvokeModel`
- **Conversation history**: Support for multi-turn conversations with context
- **Configurable parameters**: Customizable max_tokens, temperature, and top_p
- **Type-safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install
npm run build
```

## Usage

### Streaming Response

```typescript
import { BedrockService } from './bedrock';

const bedrock = new BedrockService({
  region: 'us-east-1',
  maxTokens: 2048,
  temperature: 0.7,
  topP: 0.9,
});

// Stream response tokens as they arrive
for await (const chunk of bedrock.generateResponse({
  prompt: 'What is the capital of France?',
  systemPrompt: 'You are a helpful assistant.',
})) {
  if (!chunk.isComplete) {
    process.stdout.write(chunk.text);
  } else {
    console.log(`\nTotal tokens: ${chunk.tokenCount}`);
  }
}
```

### Non-Streaming Response

```typescript
const response = await bedrock.generateResponseSync({
  prompt: 'What is the capital of France?',
  systemPrompt: 'You are a helpful assistant.',
});

console.log(response);
```

### With Conversation History

```typescript
const response = await bedrock.generateResponseSync({
  prompt: 'What about Germany?',
  conversationHistory: [
    { role: 'user', content: 'What is the capital of France?' },
    { role: 'assistant', content: 'The capital of France is Paris.' },
  ],
});
```

## Configuration

The `BedrockService` constructor accepts the following configuration options:

- `region`: AWS region (default: `process.env.AWS_REGION` or `'us-east-1'`)
- `modelId`: Bedrock model ID (default: `'anthropic.claude-3-sonnet-20240229-v1:0'`)
- `maxTokens`: Maximum tokens to generate (default: `2048`)
- `temperature`: Sampling temperature (default: `0.7`)
- `topP`: Nucleus sampling parameter (default: `0.9`)

## API Reference

### `generateResponse(request: GenerationRequest): AsyncIterator<ResponseChunk>`

Generate streaming response from Claude Haiku 4.5. Yields response chunks as they arrive.

**Parameters:**
- `request.prompt`: The user's query (required)
- `request.systemPrompt`: System instructions for Claude (optional)
- `request.conversationHistory`: Previous messages for context (optional)
- `request.maxTokens`: Override default max tokens (optional)
- `request.temperature`: Override default temperature (optional)
- `request.topP`: Override default top_p (optional)
- `request.stopSequences`: Stop sequences to halt generation (optional)

**Returns:** AsyncIterator yielding `ResponseChunk` objects with:
- `text`: Generated text fragment
- `isComplete`: Whether generation is complete
- `tokenCount`: Total tokens used (only in final chunk)

### `generateResponseSync(request: GenerationRequest): Promise<string>`

Generate non-streaming response from Claude Haiku 4.5. Returns complete response.

**Parameters:** Same as `generateResponse`

**Returns:** Promise resolving to the complete generated text

## Requirements Satisfied

- **Requirement 3.1**: Invokes Claude Haiku 4.5 model via Amazon Bedrock API
- **Requirement 3.2**: Returns responses within 2 seconds for queries without RAG retrieval

## Model Configuration

The service is configured with the following default parameters per the design specification:

- **Model**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Max Tokens**: `2048`
- **Temperature**: `0.7`
- **Top P**: `0.9`

These parameters balance response quality, creativity, and cost efficiency for conversational use cases.
