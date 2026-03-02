/**
 * Basic usage example for Chat History Store
 */

import { ChatHistoryStore } from '../dist/index.mjs';
import type { ChatMessage } from '../dist/index.mjs';

async function main() {
    // Initialize the store
    const store = new ChatHistoryStore({
        tableName: 'ChatHistory',
        region: 'us-east-1',
        kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
        ttlDays: 90,
    });

    // Example 1: Save a user message
    const userMessage: ChatMessage = {
        userId: 'user123',
        sessionId: 'session456',
        messageId: 'msg001',
        timestamp: Date.now(),
        role: 'user',
        content: 'What is the weather like today?',
        metadata: {
            tokenCount: 8,
        },
    };

    console.log('Saving user message...');
    await store.saveMessage(userMessage);
    console.log('✓ User message saved');

    // Example 2: Save an assistant message with retrieved chunks
    const assistantMessage: ChatMessage = {
        userId: 'user123',
        sessionId: 'session456',
        messageId: 'msg002',
        timestamp: Date.now() + 1000,
        role: 'assistant',
        content: 'Based on the weather data, it is sunny with a temperature of 72°F.',
        metadata: {
            retrievedChunks: ['chunk1', 'chunk2'],
            tokenCount: 20,
            latency: 1500,
        },
    };

    console.log('Saving assistant message...');
    await store.saveMessage(assistantMessage);
    console.log('✓ Assistant message saved');

    // Example 3: Retrieve conversation history
    console.log('\nRetrieving conversation history...');
    const result = await store.getHistory('user123', 'session456', 10);

    console.log(`\nFound ${result.messages.length} messages:`);
    for (const msg of result.messages) {
        console.log(`\n[${msg.role}] ${new Date(msg.timestamp).toISOString()}`);
        console.log(`Content: ${msg.content}`);
        if (msg.metadata?.tokenCount) {
            console.log(`Tokens: ${msg.metadata.tokenCount}`);
        }
        if (msg.metadata?.retrievedChunks) {
            console.log(`Retrieved chunks: ${msg.metadata.retrievedChunks.join(', ')}`);
        }
    }

    // Example 4: Retrieve with pagination
    console.log('\n\nRetrieving all messages with pagination...');
    let allMessages: ChatMessage[] = [];
    let nextToken: string | undefined = undefined;
    let pageCount = 0;

    do {
        const page = await store.getHistory('user123', 'session456', 2, nextToken);
        allMessages.push(...page.messages);
        nextToken = page.nextToken;
        pageCount++;
        console.log(`Page ${pageCount}: Retrieved ${page.messages.length} messages`);
    } while (nextToken);

    console.log(`\nTotal messages retrieved: ${allMessages.length} across ${pageCount} pages`);
}

// Run the example
main().catch(console.error);
