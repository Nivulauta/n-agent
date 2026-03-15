/**
 * Comprehensive unit tests for agent classification in the query router.
 *
 * Validates: Requirements 7.5
 *
 * Covers:
 * 1. Agent routing for multi-step queries (USE_BEDROCK_AGENT=true)
 * 2. Agent routing disabled when feature flag is off
 * 3. Backward compatibility — existing rag/direct classification unchanged
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyQuery } from './classifier';

// ---------------------------------------------------------------------------
// 1. Agent routing for multi-step queries (feature flag ON)
// ---------------------------------------------------------------------------
describe('Agent Classification', () => {
    describe('Agent routing with USE_BEDROCK_AGENT=true', () => {
        beforeEach(() => {
            vi.stubEnv('USE_BEDROCK_AGENT', 'true');
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        // -- Compare / contrast / diff queries involving multiple documents --
        describe('compare and contrast queries', () => {
            it('should route compare-document queries to agent', () => {
                const queries = [
                    'Compare document A with document B',
                    'Compare the report from Q1 with the report from Q2',
                    'Contrast the file from January against the file from March',
                    'Diff the PDF from 2023 and the PDF from 2024',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                    expect(r.reasoning).toContain('agent pattern');
                }
            });

            it('should route "document A vs document B" style queries to agent', () => {
                const queries = [
                    'document A vs document B',
                    'report X versus report Y',
                    'file alpha and file beta',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });
        });

        // -- Explicit tool use requests --
        describe('explicit tool use requests', () => {
            it('should route "use tools" queries to agent', () => {
                const queries = [
                    'Use tools to find the answer',
                    'Use tool to look up the data',
                    'Can you use tools to help me?',
                    'Using tools, find the revenue numbers',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route "search and then" / "find and then" queries to agent', () => {
                const queries = [
                    'Search and then summarize the results',
                    'Find and then compare the data',
                    'Look up and then explain the findings',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route step-by-step / multi-step queries to agent', () => {
                const queries = [
                    'Give me a step by step analysis',
                    'Do a step-by-step comparison',
                    'Perform a multi-step review of the data',
                    'Multi step analysis of the reports',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });
        });

        // -- Multi-document lookup queries --
        describe('multi-document lookup queries', () => {
            it('should route "across documents" queries to agent', () => {
                const queries = [
                    'Search across all documents for revenue data',
                    'Find information across the reports',
                    'Look across files for compliance issues',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route "between reports" queries to agent', () => {
                const queries = [
                    'Find differences between the two reports',
                    'Compare data between documents',
                    'What changed between the files?',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route "each document" queries to agent', () => {
                const queries = [
                    'Check each document for compliance issues',
                    'Review each file for errors',
                    'Summarize each report',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });
        });

        // -- Document metadata queries --
        describe('document metadata queries', () => {
            it('should route "when was X uploaded" queries to agent', () => {
                const queries = [
                    'When was the policy document uploaded?',
                    'When was the quarterly report uploaded?',
                    'Who uploaded the annual review?',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route page count / file size queries to agent', () => {
                const queries = [
                    'How many pages does the PDF have?',
                    'What is the page count of the report?',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route "list my documents" queries to agent', () => {
                const queries = [
                    'List my uploaded documents',
                    'Show my documents',
                    'Show all my files',
                    'List all uploaded files',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });

            it('should route metadata/properties queries to agent', () => {
                const queries = [
                    'Show me the metadata of the document',
                    'What are the properties of this file?',
                    'Give me details about the PDF',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to agent`).toBe('agent');
                }
            });
        });
    });

    // ---------------------------------------------------------------------------
    // 2. Agent routing disabled when feature flag is off
    // ---------------------------------------------------------------------------
    describe('Agent routing disabled (USE_BEDROCK_AGENT=false)', () => {
        beforeEach(() => {
            vi.stubEnv('USE_BEDROCK_AGENT', 'false');
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it('should NOT route compare queries to agent', () => {
            const r = classifyQuery('Compare document A with document B');
            expect(r.routeType).not.toBe('agent');
        });

        it('should NOT route tool-use queries to agent', () => {
            const r = classifyQuery('Use tools to find the answer');
            expect(r.routeType).not.toBe('agent');
        });

        it('should NOT route multi-document queries to agent', () => {
            const r = classifyQuery('Search across all documents for revenue data');
            expect(r.routeType).not.toBe('agent');
        });

        it('should NOT route metadata queries to agent', () => {
            const r = classifyQuery('When was the policy document uploaded?');
            expect(r.routeType).not.toBe('agent');
        });

        it('should NOT route step-by-step queries to agent', () => {
            const r = classifyQuery('Give me a step by step analysis');
            expect(r.routeType).not.toBe('agent');
        });

        it('should NOT route list-documents queries to agent', () => {
            const r = classifyQuery('List my uploaded documents');
            expect(r.routeType).not.toBe('agent');
        });

        it('should fall back to rag or direct for all agent-eligible queries', () => {
            const agentQueries = [
                'Compare document A with document B',
                'Use tools to find the answer',
                'Search and then summarize the results',
                'Search across all documents for revenue data',
                'When was the policy document uploaded?',
                'How many pages does the PDF have?',
                'List my uploaded documents',
                'Show all my files',
                'Do a step-by-step comparison',
            ];
            for (const q of agentQueries) {
                const r = classifyQuery(q);
                expect(r.routeType === 'rag' || r.routeType === 'direct',
                    `"${q}" should route to rag or direct, got ${r.routeType}`).toBe(true);
            }
        });
    });

    describe('Agent routing disabled (USE_BEDROCK_AGENT unset)', () => {
        beforeEach(() => {
            delete process.env.USE_BEDROCK_AGENT;
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it('should NOT route to agent when env var is not set', () => {
            const agentQueries = [
                'Compare document A with document B',
                'Use tools to find the answer',
                'Search across all documents for revenue data',
                'When was the policy document uploaded?',
                'List my uploaded documents',
            ];
            for (const q of agentQueries) {
                const r = classifyQuery(q);
                expect(r.routeType, `"${q}" should not route to agent`).not.toBe('agent');
            }
        });
    });

    // ---------------------------------------------------------------------------
    // 3. Backward compatibility — rag/direct classification unchanged
    // ---------------------------------------------------------------------------
    describe('Backward compatibility with agent enabled', () => {
        beforeEach(() => {
            vi.stubEnv('USE_BEDROCK_AGENT', 'true');
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        describe('simple document questions still route to rag', () => {
            it('should route basic document questions to rag', () => {
                const queries = [
                    'What is in the document?',
                    'What does the file say about revenue?',
                    'Find information about the policy',
                    'Show me the document',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to rag`).toBe('rag');
                    expect(r.requiresRetrieval).toBe(true);
                }
            });

            it('should route simple "what/who/where" questions to rag', () => {
                const queries = [
                    'What is the policy?',
                    'Who is the author?',
                    'Where is the deadline mentioned?',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to rag`).toBe('rag');
                }
            });
        });

        describe('conversational queries still route to direct', () => {
            it('should route greetings to direct', () => {
                const queries = ['Hello', 'Hi there', 'Good morning', 'Hey'];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to direct`).toBe('direct');
                    expect(r.requiresRetrieval).toBe(false);
                }
            });

            it('should route thanks/gratitude to direct', () => {
                const queries = ['Thank you', 'Thanks!', 'I appreciate it'];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to direct`).toBe('direct');
                }
            });

            it('should route farewells to direct', () => {
                const queries = ['Goodbye', 'Bye', 'See you later', 'Take care'];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to direct`).toBe('direct');
                }
            });

            it('should route acknowledgments to direct', () => {
                const queries = ['Okay', 'Sure', 'Got it', 'I see'];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.routeType, `"${q}" should route to direct`).toBe('direct');
                }
            });

            it('should route empty queries to direct', () => {
                const r = classifyQuery('');
                expect(r.routeType).toBe('direct');
                expect(r.requiresRetrieval).toBe(false);
            });
        });

        describe('standard retrieval queries get correct k values', () => {
            it('should return k=5 for simple retrieval queries', () => {
                const queries = [
                    'What is the policy?',
                    'Who is the author?',
                    'Show me the document',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.suggestedK, `"${q}" should have k=5`).toBe(5);
                }
            });

            it('should return k=10 for complex retrieval queries', () => {
                const queries = [
                    'Give me a complete overview of all policies',
                    'Show me every document about this topic',
                    'Find all references to this subject',
                ];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.suggestedK, `"${q}" should have k=10`).toBe(10);
                }
            });

            it('should return k=0 for non-retrieval queries', () => {
                const queries = ['Hello', 'Thank you', 'Goodbye'];
                for (const q of queries) {
                    const r = classifyQuery(q);
                    expect(r.suggestedK, `"${q}" should have k=0`).toBe(0);
                }
            });
        });

        describe('confidence scores remain consistent for non-agent queries', () => {
            it('should have high confidence for clear conversational patterns', () => {
                const r = classifyQuery('Hello');
                expect(r.confidence).toBeGreaterThanOrEqual(0.9);
            });

            it('should have high confidence for multiple document keywords', () => {
                const r = classifyQuery('Search the documents and files');
                expect(r.confidence).toBeGreaterThanOrEqual(0.9);
            });

            it('should have moderate confidence for simple questions', () => {
                const r = classifyQuery('What is this?');
                expect(r.confidence).toBeGreaterThanOrEqual(0.7);
                expect(r.confidence).toBeLessThan(0.95);
            });
        });
    });
});
