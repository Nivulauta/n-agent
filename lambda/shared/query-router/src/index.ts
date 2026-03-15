/**
 * Query Router Module
 * 
 * Classifies user queries to determine if RAG retrieval is needed or if
 * a direct LLM response is sufficient.
 * 
 * Classification is based on:
 * - Question patterns (who, what, where, when, why, how)
 * - Document-related keywords (document, file, PDF, page)
 * - Conversational patterns (greetings, thanks, follow-ups)
 * - Query complexity indicators
 * - Conversation context
 */

export { classifyQuery, classifyQueryWithFallback } from './classifier';
export { classifyWithClaude, BedrockClassifierService } from './claude-classifier';
export { QueryClassification, RouteType, Message } from './types';
