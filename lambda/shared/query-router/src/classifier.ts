import { QueryClassification, RouteType, Message } from './types';
import { classifyWithClaude, BedrockClassifierService } from './claude-classifier';

/**
 * Query patterns that indicate retrieval is needed
 */
const QUESTION_PATTERNS = [
    /\b(who|what|where|when|why|how)\b/i,
    /\b(tell me|explain|describe|show me|find|search)\b/i,
    /\b(can you|could you|would you|will you)\b.*\b(find|search|look|check)\b/i,
    /\?$/  // Ends with question mark
];

/**
 * Document-related keywords that strongly indicate retrieval is needed
 */
const DOCUMENT_KEYWORDS = [
    /\b(document|documents|file|files|pdf|pdfs)\b/i,
    /\b(page|pages|section|sections|chapter|chapters)\b/i,
    /\b(uploaded|upload|stored|storage)\b/i,
    /\b(in the|from the|according to)\b.*\b(document|file|pdf)\b/i
];

/**
 * Conversational patterns that indicate direct LLM response (no retrieval)
 */
const CONVERSATIONAL_PATTERNS = [
    // Greetings
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)\b/i,

    // Thanks/gratitude
    /\b(thank|thanks|thx|appreciate|grateful)\b/i,

    // Farewells
    /\b(bye|goodbye|see you|farewell|take care)\b/i,

    // Acknowledgments
    /^(ok|okay|sure|alright|got it|understood|i see)\b/i,

    // Follow-up conversational
    /^(yes|no|maybe|perhaps|i think|i believe)\b/i,

    // Meta questions about the assistant
    /\b(who are you|what are you|your name|can you help)\b/i,

    // Common conversational questions
    /^(how are you|how's it going|what's up)\b/i,
];

/**
 * Complex query indicators that suggest more documents should be retrieved
 */
const COMPLEX_QUERY_INDICATORS = [
    /\b(compare|contrast|difference|similar|relationship)\b/i,
    /\b(all|every|entire|complete|comprehensive)\b/i,
    /\b(multiple|several|various|different)\b/i,
    /\band\b.*\band\b/i,  // Multiple "and" conjunctions
    /\bor\b.*\bor\b/i     // Multiple "or" conjunctions
];

/**
 * Agent routing patterns — queries that benefit from multi-step reasoning with tools
 */
const AGENT_PATTERNS = [
    // Multi-step queries: compare document A with document B
    /\b(compare|contrast|diff)\b.*\b(document|file|pdf|report)\b.*\b(with|to|and|against|versus|vs)\b.*\b(document|file|pdf|report)\b/i,
    /\b(document|file|pdf|report)\b.*\b(and|vs|versus)\b.*\b(document|file|pdf|report)\b/i,

    // Explicit agent/tool requests
    /\b(use tools?|using tools?)\b/i,
    /\b(search\s+and\s+then|find\s+and\s+then|look up\s+and\s+then)\b/i,
    /\b(step[- ]by[- ]step|multi[- ]step)\b/i,

    // Queries requiring multiple document lookups
    /\b(across|between|among)\b.*\b(documents?|files?|pdfs?|reports?)\b/i,
    /\b(each|every)\b.*\b(document|file|pdf|report)\b/i,
    /\b(all\s+(?:the\s+)?documents?|all\s+(?:the\s+)?files?)\b.*\b(and|then)\b/i,

    // Document metadata queries
    /\b(when\s+was|who\s+uploaded|upload\s+date|upload\s+time|file\s+size|page\s+count|how\s+many\s+pages)\b/i,
    /\b(metadata|properties|details|info)\b.*\b(of|about|for)\b.*\b(document|file|pdf)\b/i,
    /\b(list|show)\b.*\b(my|all|uploaded)\b.*\b(documents?|files?|pdfs?)\b/i,
];

/**
 * Check if the Bedrock Agent feature flag is enabled
 */
function isAgentEnabled(): boolean {
    return process.env.USE_BEDROCK_AGENT === 'true';
}

/**
 * Determine optimal number of document chunks (k) to retrieve based on query complexity
 * 
 * Analysis considers:
 * - Whether retrieval is needed at all
 * - Presence of complex query indicators (comparisons, multiple topics)
 * - Number of document-related keywords
 * - Query length (word count)
 * - Specific patterns indicating broad vs narrow information needs
 * 
 * @param requiresRetrieval - Whether RAG retrieval is needed
 * @param hasComplexIndicator - Whether query has complexity indicators
 * @param documentKeywordCount - Number of document-related keywords found
 * @param wordCount - Number of words in the query
 * @param query - The normalized query text
 * @returns Suggested k value (0, 5, or 10)
 */
function determineOptimalK(
    requiresRetrieval: boolean,
    hasComplexIndicator: boolean,
    documentKeywordCount: number,
    wordCount: number,
    query: string
): number {
    // No retrieval needed - return 0
    if (!requiresRetrieval) {
        return 0;
    }

    // Start with default k=5
    let k = 5;

    // Complexity score calculation
    let complexityScore = 0;

    // Factor 1: Complex query indicators (comparisons, comprehensive requests)
    if (hasComplexIndicator) {
        complexityScore += 2;
    }

    // Factor 2: Multiple document references suggest need for more context
    if (documentKeywordCount >= 2) {
        complexityScore += 2;
    }

    // Factor 3: Long queries often need more comprehensive answers
    if (wordCount > 15) {
        complexityScore += 1;
    }
    if (wordCount > 20) {
        complexityScore += 1;  // Additional point for very long queries
    }

    // Factor 4: Specific patterns indicating broad information needs
    const broadPatterns = [
        /\b(overview|summary|summarize|explain everything)\b/i,
        /\b(list all|show all|find all)\b/i,
        /\b(comprehensive|detailed|thorough|complete)\b/i,
    ];

    for (const pattern of broadPatterns) {
        if (pattern.test(query)) {
            complexityScore += 2;  // Increased from 1 to 2 for stronger signal
            break;
        }
    }

    // Factor 5: Multiple questions in one query
    const questionMarkCount = (query.match(/\?/g) || []).length;
    if (questionMarkCount >= 2) {
        complexityScore += 2;  // Increased from 1 to 2
    }

    // Determine k based on complexity score
    // Score >= 2: Complex query, use k=10
    // Score < 2: Simple query, use k=5 (default)
    if (complexityScore >= 2) {
        k = 10;
    }

    return k;
}

/**
 * Classify a query to determine if RAG retrieval is needed
 * 
 * @param query - The user's query text
 * @param conversationContext - Previous messages for context (optional)
 * @returns QueryClassification with retrieval decision and confidence
 */
export function classifyQuery(
    query: string,
    conversationContext: Message[] = []
): QueryClassification {
    const normalizedQuery = query.trim();

    // Empty query - no retrieval needed
    if (!normalizedQuery) {
        return {
            requiresRetrieval: false,
            routeType: 'direct',
            confidence: 1.0,
            reasoning: 'Empty query',
            suggestedK: 0
        };
    }

    let retrievalScore = 0;
    let maxScore = 0;
    const reasons: string[] = [];

    // Check for agent routing patterns
    let hasAgentPattern = false;
    if (isAgentEnabled()) {
        for (const pattern of AGENT_PATTERNS) {
            if (pattern.test(normalizedQuery)) {
                hasAgentPattern = true;
                reasons.push('agent pattern detected');
                break;
            }
        }
    }

    // Check for conversational patterns (strong indicator for NO retrieval)
    maxScore += 3;
    let hasConversationalPattern = false;
    for (const pattern of CONVERSATIONAL_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            hasConversationalPattern = true;
            reasons.push('conversational pattern detected');
            break;
        }
    }

    if (hasConversationalPattern) {
        retrievalScore -= 3;  // Strong negative score
    }

    // Check for document-related keywords (strong indicator for retrieval)
    maxScore += 4;
    let documentKeywordCount = 0;
    for (const pattern of DOCUMENT_KEYWORDS) {
        if (pattern.test(normalizedQuery)) {
            documentKeywordCount++;
        }
    }

    if (documentKeywordCount > 0) {
        retrievalScore += Math.min(documentKeywordCount * 2, 4);
        reasons.push(`${documentKeywordCount} document keyword(s) found`);
    }

    // Check for question patterns (moderate indicator for retrieval)
    maxScore += 2;
    let hasQuestionPattern = false;
    for (const pattern of QUESTION_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            hasQuestionPattern = true;
            retrievalScore += 2;
            reasons.push('question pattern detected');
            break;
        }
    }

    // Check for complex query indicators
    maxScore += 1;
    let hasComplexIndicator = false;
    for (const pattern of COMPLEX_QUERY_INDICATORS) {
        if (pattern.test(normalizedQuery)) {
            hasComplexIndicator = true;
            retrievalScore += 1;
            reasons.push('complex query indicator detected');
            break;
        }
    }

    // Check query length (longer queries often need retrieval)
    maxScore += 1;
    const wordCount = normalizedQuery.split(/\s+/).length;
    if (wordCount > 10) {
        retrievalScore += 1;
        reasons.push('long query (>10 words)');
    }

    // Check for follow-up context
    if (conversationContext.length > 0) {
        const lastMessage = conversationContext[conversationContext.length - 1];

        // If last assistant message mentioned documents, likely a follow-up
        if (lastMessage.role === 'assistant' &&
            /\b(document|file|pdf|page|section)\b/i.test(lastMessage.content)) {
            retrievalScore += 1;
            reasons.push('follow-up to document-related conversation');
            maxScore += 1;
        }
    }

    // Calculate confidence and decision
    const normalizedScore = maxScore > 0 ? retrievalScore / maxScore : 0;
    const requiresRetrieval = retrievalScore > 0;

    // Confidence calculation
    let confidence: number;
    if (hasConversationalPattern && !hasQuestionPattern && documentKeywordCount === 0) {
        // Strong conversational pattern, no retrieval indicators
        confidence = 0.95;
    } else if (documentKeywordCount >= 2) {
        // Multiple document keywords - high confidence for retrieval
        confidence = 0.95;
    } else if (documentKeywordCount === 1 && hasQuestionPattern) {
        // Document keyword + question - high confidence for retrieval
        confidence = 0.90;
    } else if (hasQuestionPattern && wordCount > 5) {
        // Question with reasonable length - moderate confidence for retrieval
        confidence = 0.75;
    } else if (retrievalScore > 0) {
        // Some indicators present - moderate confidence
        confidence = 0.70;
    } else {
        // No clear indicators - low confidence
        confidence = 0.60;
    }

    // Determine suggested k based on query complexity
    const suggestedK = determineOptimalK(
        requiresRetrieval,
        hasComplexIndicator,
        documentKeywordCount,
        wordCount,
        normalizedQuery
    );

    const reasoning = reasons.length > 0
        ? reasons.join(', ')
        : 'no strong indicators detected';

    // Determine route type
    let routeType: RouteType;
    if (hasAgentPattern) {
        routeType = 'agent';
    } else if (requiresRetrieval) {
        routeType = 'rag';
    } else {
        routeType = 'direct';
    }

    return {
        requiresRetrieval,
        routeType,
        confidence,
        reasoning,
        suggestedK
    };
}

/**
 * Classify a query with Claude fallback for ambiguous cases
 * 
 * First attempts heuristic classification. If confidence < 0.7, falls back
 * to Claude-based classification for more accurate results.
 * 
 * @param query - The user's query text
 * @param conversationContext - Previous messages for context (optional)
 * @param bedrockService - Bedrock service instance for Claude fallback (required for fallback)
 * @returns QueryClassification with retrieval decision and confidence
 */
export async function classifyQueryWithFallback(
    query: string,
    conversationContext: Message[] = [],
    bedrockService?: BedrockClassifierService
): Promise<QueryClassification> {
    // First, try heuristic classification
    const heuristicResult = classifyQuery(query, conversationContext);

    // If confidence is high enough, use heuristic result
    if (heuristicResult.confidence >= 0.7) {
        return heuristicResult;
    }

    // Low confidence - use Claude for better classification if service is available
    if (!bedrockService) {
        // No Bedrock service provided, return heuristic result
        return {
            ...heuristicResult,
            reasoning: `${heuristicResult.reasoning} (Claude fallback not available)`,
        };
    }

    try {
        const claudeResult = await classifyWithClaude(query, conversationContext, bedrockService);

        // Add note that Claude was used
        return {
            ...claudeResult,
            reasoning: `${claudeResult.reasoning} (fallback from heuristic: ${heuristicResult.reasoning})`,
        };
    } catch (error) {
        // If Claude fails, return heuristic result as fallback
        logError('Claude fallback failed, using heuristic result:', error);
        return {
            ...heuristicResult,
            reasoning: `${heuristicResult.reasoning} (Claude fallback failed)`,
        };
    }
}

/**
 * Simple error logging helper
 */
function logError(...args: any[]): void {
    // Simple no-op for now - errors will be caught and handled by callers
    // In production, this would integrate with CloudWatch Logs
}
