/**
 * Claude-based fallback classifier for ambiguous queries
 * 
 * When heuristic classification has low confidence (< 0.7), this module
 * uses Claude via Bedrock to make a more informed classification decision.
 */

import { QueryClassification, RouteType, Message } from './types';

/**
 * Minimal Bedrock service interface for classification
 * This allows the classifier to work without direct dependency on the bedrock module
 */
export interface BedrockClassifierService {
    generateResponseSync(request: {
        prompt: string;
        systemPrompt?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are a query classification assistant. Your job is to determine the best execution route for a user's query. There are three possible routes:

1. "rag" — Retrieve information from uploaded documents, then generate a response using that context.
2. "direct" — Answer directly using the AI assistant's general knowledge, no document lookup needed.
3. "agent" — Use multi-step reasoning with tools (e.g., searching documents, comparing results, performing multiple lookups, or using external tools).

Route to "rag" when:
- The query asks about specific documents, files, or PDFs
- The query asks for information that would be in organizational documents
- The query references "the document", "the file", "uploaded content"
- The query asks for specific facts, data, or details that need verification from documents
- The query asks to find, search, or look up information in documents

Route to "direct" when:
- The query is a general knowledge question that doesn't reference documents
- The query is a conversational exchange (greetings, thanks, acknowledgments)
- The query asks about the assistant's capabilities
- The query is a creative task (writing, brainstorming) that doesn't need document context
- The query is a follow-up clarification about a previous response

Route to "agent" when:
- The query requires comparing information across multiple documents (e.g., "Compare the Q1 and Q2 reports")
- The query involves multi-step reasoning or chained lookups (e.g., "Find the budget for Project X, then check if it exceeds the policy limit")
- The query explicitly asks to use tools or perform actions (e.g., "Use the calculator to sum up expenses")
- The query requires gathering and synthesizing data from several sources (e.g., "Summarize all documents uploaded this month")
- The query asks the assistant to perform a workflow or sequence of operations (e.g., "List my documents and then search the newest one for risk factors")

Respond with ONLY a JSON object in this exact format:
{
  "routeType": "rag" or "direct" or "agent",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of your decision"
}`;

/**
 * Use Claude to classify an ambiguous query
 * 
 * @param query - The user's query text
 * @param conversationContext - Previous messages for context
 * @param bedrockService - BedrockService instance (required)
 * @returns QueryClassification with Claude's decision
 */
export async function classifyWithClaude(
    query: string,
    conversationContext: Message[] = [],
    bedrockService: BedrockClassifierService
): Promise<QueryClassification> {
    // Build the classification prompt
    let prompt = `Query to classify: "${query}"`;

    // Add conversation context if available
    if (conversationContext.length > 0) {
        prompt += '\n\nRecent conversation context:\n';
        const recentMessages = conversationContext.slice(-3);  // Last 3 messages
        for (const msg of recentMessages) {
            prompt += `${msg.role}: ${msg.content}\n`;
        }
    }

    prompt += '\n\nProvide your classification as JSON:';

    try {
        // Call Claude for classification
        const response = await bedrockService.generateResponseSync({
            prompt,
            systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
            maxTokens: 256,
            temperature: 0.3,
        });

        // Parse Claude's response
        const classification = parseClaudeResponse(response, query);
        return classification;

    } catch (error) {
        // If Claude fails, default to requiring retrieval (safer choice)
        logError('Claude classification failed:', error);
        return {
            requiresRetrieval: true,
            routeType: 'rag' as RouteType,
            confidence: 0.5,
            reasoning: 'Claude classification failed, defaulting to retrieval',
            suggestedK: 5,
        };
    }
}

/**
 * Parse Claude's JSON response into QueryClassification
 * 
 * @param response - Raw response text from Claude
 * @param query - Original query (for dynamic k calculation)
 * @returns QueryClassification object
 */
function parseClaudeResponse(response: string, query: string): QueryClassification {
    try {
        // Extract JSON from response (Claude might include extra text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in Claude response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Determine route type — prefer explicit routeType, fall back to requiresRetrieval
        let routeType: RouteType;
        if (parsed.routeType === 'agent' || parsed.routeType === 'rag' || parsed.routeType === 'direct') {
            routeType = parsed.routeType;
        } else if (typeof parsed.requiresRetrieval === 'boolean') {
            routeType = parsed.requiresRetrieval ? 'rag' : 'direct';
        } else {
            throw new Error('Invalid response: missing routeType and requiresRetrieval');
        }

        const requiresRetrieval = routeType === 'rag' || routeType === 'agent';

        const confidence = typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.7;

        const reasoning = typeof parsed.reasoning === 'string'
            ? `Claude: ${parsed.reasoning}`
            : 'Claude classification';

        // Determine suggested k based on query complexity
        const suggestedK = determineOptimalKForClaude(requiresRetrieval, query);

        return {
            requiresRetrieval,
            routeType,
            confidence,
            reasoning,
            suggestedK,
        };

    } catch (error) {
        logError('Failed to parse Claude response:', error);
        logError('Raw response:', response);

        // Fallback: default to retrieval for safety
        return {
            requiresRetrieval: true,
            routeType: 'rag' as RouteType,
            confidence: 0.5,
            reasoning: 'Failed to parse Claude response, defaulting to retrieval',
            suggestedK: 5,
        };
    }
}

/**
 * Determine optimal k value for Claude-classified queries
 * 
 * @param requiresRetrieval - Whether retrieval is needed
 * @param query - The original query text
 * @returns Suggested k value (0, 5, or 10)
 */
function determineOptimalKForClaude(requiresRetrieval: boolean, query: string): number {
    if (!requiresRetrieval) {
        return 0;
    }

    // Analyze query complexity
    const wordCount = query.trim().split(/\s+/).length;
    let complexityScore = 0;

    // Complex query patterns
    const complexPatterns = [
        /\b(compare|contrast|difference|similar|relationship)\b/i,
        /\b(all|every|entire|complete|comprehensive)\b/i,
        /\b(multiple|several|various|different)\b/i,
        /\b(overview|summary|summarize|explain everything)\b/i,
        /\b(list all|show all|find all)\b/i,
    ];

    for (const pattern of complexPatterns) {
        if (pattern.test(query)) {
            complexityScore += 1;
        }
    }

    // Long queries suggest complexity
    if (wordCount > 15) {
        complexityScore += 1;
    }

    // Multiple questions
    const questionMarkCount = (query.match(/\?/g) || []).length;
    if (questionMarkCount >= 2) {
        complexityScore += 1;
    }

    // Return k=10 for complex queries, k=5 for simple ones
    return complexityScore >= 2 ? 10 : 5;
}

/**
 * Simple error logging helper
 */
function logError(...args: any[]): void {
    // Simple no-op for now - errors will be caught and handled by callers
    // In production, this would integrate with CloudWatch Logs
}
