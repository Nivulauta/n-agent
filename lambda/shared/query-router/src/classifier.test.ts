/**
 * Unit tests for query classification and dynamic k selection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyQuery } from './classifier';
import { Message } from './types';

describe('Query Classification', () => {
    describe('Dynamic K Selection', () => {
        describe('k=0 for non-retrieval queries', () => {
            it('should return k=0 for greetings', () => {
                const queries = ['Hello', 'Hi there', 'Good morning', 'Hey'];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(0);
                    expect(result.requiresRetrieval).toBe(false);
                }
            });

            it('should return k=0 for thanks/gratitude', () => {
                const queries = ['Thank you', 'Thanks!', 'I appreciate it'];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(0);
                    expect(result.requiresRetrieval).toBe(false);
                }
            });

            it('should return k=0 for conversational acknowledgments', () => {
                const queries = ['Okay', 'Sure', 'Got it', 'I see'];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(0);
                    expect(result.requiresRetrieval).toBe(false);
                }
            });

            it('should return k=0 for empty queries', () => {
                const result = classifyQuery('');
                expect(result.suggestedK).toBe(0);
                expect(result.requiresRetrieval).toBe(false);
            });
        });

        describe('k=5 for simple retrieval queries (default)', () => {
            it('should return k=5 for simple questions', () => {
                const queries = [
                    'What is the policy?',
                    'Who is the author?',
                    'When was this created?',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(5);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=5 for single document keyword queries', () => {
                const queries = [
                    'Show me the document',
                    'What does the file say?',
                    // Note: "Find information in the PDF" has 2 document keywords (information, PDF)
                    // so it will return k=10 for complexity
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(5);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=5 for short specific questions', () => {
                const queries = [
                    'What is the deadline?',
                    'Who approved this?',
                    'Where is the office?',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(5);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });
        });

        describe('k=10 for complex retrieval queries', () => {
            it('should return k=10 for comparison queries', () => {
                const queries = [
                    'Compare the two policies',
                    'What is the difference between A and B?',
                    'How are these documents similar?',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(10);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=10 for comprehensive requests', () => {
                const queries = [
                    'Give me a complete overview of all policies',
                    'Show me every document about this topic',
                    'Find all references to this subject',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(10);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=10 for queries with multiple document keywords', () => {
                const queries = [
                    'Search all documents and files for this information',
                    'Check the PDFs and documents on page 5',
                    'Find this in the uploaded files and documents',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(10);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=10 for long complex queries', () => {
                const query = 'Can you provide a detailed explanation of the policy changes that were made in the last quarter and how they compare to the previous year?';

                const result = classifyQuery(query);
                expect(result.suggestedK).toBe(10);
                expect(result.requiresRetrieval).toBe(true);
            });

            it('should return k=10 for queries with multiple questions', () => {
                const queries = [
                    'What is the policy? How does it compare to the old one?',
                    'Who approved this? When was it approved? Where is it documented?',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(10);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=10 for queries with "and" conjunctions', () => {
                const query = 'Find information about policy A and policy B and policy C';

                const result = classifyQuery(query);
                expect(result.suggestedK).toBe(10);
                expect(result.requiresRetrieval).toBe(true);
            });

            it('should return k=10 for queries with "or" conjunctions', () => {
                const query = 'Show me documents about topic A or topic B or topic C';

                const result = classifyQuery(query);
                expect(result.suggestedK).toBe(10);
                expect(result.requiresRetrieval).toBe(true);
            });

            it('should return k=10 for queries requesting summaries', () => {
                const queries = [
                    'Summarize all the documents about this topic',
                    'Provide a comprehensive summary of the files',
                    'Give me a detailed overview of the uploaded documents',
                ];

                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.suggestedK).toBe(10);
                    expect(result.requiresRetrieval).toBe(true);
                }
            });

            it('should return k=10 for queries with multiple complexity indicators', () => {
                const query = 'Compare all the comprehensive policies and show me every difference';

                const result = classifyQuery(query);
                expect(result.suggestedK).toBe(10);
                expect(result.requiresRetrieval).toBe(true);
            });
        });

        describe('Edge cases', () => {
            it('should handle queries with mixed signals', () => {
                // Has question pattern but is conversational
                const result = classifyQuery('How are you?');
                // Should still detect conversational pattern
                expect(result.requiresRetrieval).toBe(false);
                expect(result.suggestedK).toBe(0);
            });

            it('should handle very long conversational queries', () => {
                const query = 'Thank you so much for all your help today, I really appreciate everything you have done for me and I am very grateful';

                const result = classifyQuery(query);
                expect(result.requiresRetrieval).toBe(false);
                expect(result.suggestedK).toBe(0);
            });

            it('should handle queries with document keywords but conversational', () => {
                const query = 'Thanks for showing me that document';

                const result = classifyQuery(query);
                // Conversational pattern should dominate
                expect(result.requiresRetrieval).toBe(false);
                expect(result.suggestedK).toBe(0);
            });
        });

        describe('Conversation context influence', () => {
            it('should consider follow-up context from document-related conversation', () => {
                const context: Message[] = [
                    {
                        role: 'user',
                        content: 'Show me the policy document',
                    },
                    {
                        role: 'assistant',
                        content: 'Here is the information from the policy document on page 5...',
                    },
                ];

                const result = classifyQuery('What about section 3?', context);
                expect(result.requiresRetrieval).toBe(true);
                // Should still be simple query (k=5) unless other complexity indicators
                expect(result.suggestedK).toBe(5);
            });

            it('should not be influenced by non-document conversation', () => {
                const context: Message[] = [
                    {
                        role: 'user',
                        content: 'Hello',
                    },
                    {
                        role: 'assistant',
                        content: 'Hi! How can I help you today?',
                    },
                ];

                const result = classifyQuery('Thanks', context);
                expect(result.requiresRetrieval).toBe(false);
                expect(result.suggestedK).toBe(0);
            });
        });
    });

    describe('Classification Confidence', () => {
        it('should have high confidence for clear conversational patterns', () => {
            const result = classifyQuery('Hello');
            expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        });

        it('should have high confidence for multiple document keywords', () => {
            const result = classifyQuery('Search the documents and files');
            expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        });

        it('should have moderate confidence for simple questions', () => {
            const result = classifyQuery('What is this?');
            expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            expect(result.confidence).toBeLessThan(0.9);
        });

        it('should have lower confidence for ambiguous queries', () => {
            const result = classifyQuery('Tell me more');
            expect(result.confidence).toBeLessThan(0.8);
        });
    });

    describe('Reasoning', () => {
        it('should provide reasoning for classification decisions', () => {
            const result = classifyQuery('What is in the document?');
            expect(result.reasoning).toBeTruthy();
            expect(result.reasoning.length).toBeGreaterThan(0);
        });

        it('should mention document keywords in reasoning', () => {
            const result = classifyQuery('Show me the PDF file');
            expect(result.reasoning).toContain('document keyword');
        });

        it('should mention question patterns in reasoning', () => {
            const result = classifyQuery('What is the answer?');
            expect(result.reasoning).toContain('question pattern');
        });

        it('should mention conversational patterns in reasoning', () => {
            const result = classifyQuery('Thank you');
            expect(result.reasoning).toContain('conversational pattern');
        });
    });

    describe('Route Type Classification', () => {
        it('should return routeType "direct" for conversational queries', () => {
            const queries = ['Hello', 'Thank you', 'Goodbye'];
            for (const query of queries) {
                const result = classifyQuery(query);
                expect(result.routeType).toBe('direct');
            }
        });

        it('should return routeType "rag" for document queries when agent is disabled', () => {
            const result = classifyQuery('What is in the document?');
            expect(result.routeType).toBe('rag');
        });

        it('should return routeType "direct" for empty queries', () => {
            const result = classifyQuery('');
            expect(result.routeType).toBe('direct');
        });

        describe('Agent routing (USE_BEDROCK_AGENT=true)', () => {
            beforeEach(() => {
                vi.stubEnv('USE_BEDROCK_AGENT', 'true');
            });

            afterEach(() => {
                vi.unstubAllEnvs();
            });

            it('should route multi-step compare queries to agent', () => {
                const queries = [
                    'Compare document A with document B',
                    'Contrast the report from Q1 against the report from Q2',
                    'Diff the PDF from January and the PDF from March',
                ];
                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.routeType).toBe('agent');
                    expect(result.reasoning).toContain('agent pattern');
                }
            });

            it('should route explicit tool requests to agent', () => {
                const queries = [
                    'Use tools to find the answer',
                    'Search and then summarize the results',
                    'Find and then compare the data',
                ];
                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.routeType).toBe('agent');
                }
            });

            it('should route multi-document lookup queries to agent', () => {
                const queries = [
                    'Search across all documents for revenue data',
                    'Find information between the two reports',
                    'Look at each document for compliance issues',
                ];
                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.routeType).toBe('agent');
                }
            });

            it('should route document metadata queries to agent', () => {
                const queries = [
                    'When was the policy document uploaded?',
                    'Who uploaded the quarterly report?',
                    'How many pages does the PDF have?',
                    'List my uploaded documents',
                    'Show all my files',
                ];
                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.routeType).toBe('agent');
                }
            });

            it('should route simple document queries to agent when agent is enabled', () => {
                const result = classifyQuery('What is in the document?');
                expect(result.routeType).toBe('agent');
            });

            it('should still route conversational queries to direct', () => {
                const result = classifyQuery('Hello');
                expect(result.routeType).toBe('direct');
            });
        });

        describe('Agent routing disabled (USE_BEDROCK_AGENT unset)', () => {
            beforeEach(() => {
                vi.stubEnv('USE_BEDROCK_AGENT', 'false');
            });

            afterEach(() => {
                vi.unstubAllEnvs();
            });

            it('should never route to agent when feature flag is off', () => {
                const queries = [
                    'Compare document A with document B',
                    'Use tools to find the answer',
                    'When was the policy uploaded?',
                    'List my uploaded documents',
                ];
                for (const query of queries) {
                    const result = classifyQuery(query);
                    expect(result.routeType).not.toBe('agent');
                }
            });
        });
    });

    describe('Requirement 7.5 Validation', () => {
        it('should default to k=5 for retrieval queries', () => {
            const simpleQueries = [
                'What is the policy?',
                'Find this information',
                'Show me the document',
            ];

            for (const query of simpleQueries) {
                const result = classifyQuery(query);
                if (result.requiresRetrieval) {
                    expect(result.suggestedK).toBeGreaterThanOrEqual(5);
                }
            }
        });

        it('should increase to k=10 for complex queries', () => {
            const complexQueries = [
                'Compare all policies and show differences',
                'Give me a comprehensive overview of everything',
                'Find all documents about topic A and topic B',
            ];

            for (const query of complexQueries) {
                const result = classifyQuery(query);
                expect(result.suggestedK).toBe(10);
                expect(result.requiresRetrieval).toBe(true);
            }
        });

        it('should determine retrieval need with 90% accuracy on clear cases', () => {
            // Test clear retrieval cases
            const retrievalQueries = [
                'What is in the document?',
                'Find information about X',
                'Show me the policy',
            ];

            for (const query of retrievalQueries) {
                const result = classifyQuery(query);
                expect(result.requiresRetrieval).toBe(true);
                expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            }

            // Test clear non-retrieval cases
            const nonRetrievalQueries = [
                'Hello',
                'Thank you',
                'Goodbye',
            ];

            for (const query of nonRetrievalQueries) {
                const result = classifyQuery(query);
                expect(result.requiresRetrieval).toBe(false);
                expect(result.confidence).toBeGreaterThanOrEqual(0.9);
            }
        });
    });
});
