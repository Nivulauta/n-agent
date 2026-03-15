/**
 * Route type for query classification
 * - 'rag': Standard retrieval-augmented generation pipeline
 * - 'direct': Direct LLM response without document retrieval
 * - 'agent': Multi-step reasoning via Bedrock InlineAgent with tool use
 */
export type RouteType = 'rag' | 'direct' | 'agent';

/**
 * Query classification result
 */
export interface QueryClassification {
    /** Whether RAG retrieval is required for this query */
    requiresRetrieval: boolean;

    /** The execution route for this query */
    routeType: RouteType;

    /** Confidence score (0.0 to 1.0) */
    confidence: number;

    /** Reasoning for the classification decision */
    reasoning: string;

    /** Suggested number of documents to retrieve (k) */
    suggestedK: number;
}

/**
 * Message context for classification
 */
export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}
