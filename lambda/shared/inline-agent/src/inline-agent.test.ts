import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineAgentService } from './inline-agent.js';
import type {
    InlineAgentRequest,
    ActionGroupConfig,
    AgentResponseChunk,
    ReturnControlPayload,
} from './types.js';

// ── Mock AWS SDK ───────────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
    BedrockAgentRuntimeClient: vi.fn(() => ({ send: mockSend })),
    InvokeInlineAgentCommand: vi.fn((input: any) => ({ input })),
}));

// ── Helpers ────────────────────────────────────────────────────────────

function makeActionGroup(name = 'TestTools'): ActionGroupConfig {
    return {
        actionGroupName: name,
        description: 'Test action group',
        actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
        functionSchema: {
            functions: [
                {
                    name: 'search',
                    description: 'Search docs',
                    parameters: {
                        query: { type: 'string', description: 'query', required: true },
                    },
                },
            ],
        },
    };
}

function makeRequest(overrides: Partial<InlineAgentRequest> = {}): InlineAgentRequest {
    return {
        inputText: 'Hello',
        sessionId: 'sess-1',
        userId: 'user-1',
        instruction: 'You are a helpful assistant.',
        foundationModel: 'anthropic.claude-haiku-4-5',
        actionGroups: [makeActionGroup()],
        ...overrides,
    };
}

/** Create an async iterable from an array of stream events */
async function* asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}

/** Collect all chunks from an async generator */
async function collectChunks(gen: AsyncGenerator<AgentResponseChunk>): Promise<AgentResponseChunk[]> {
    const chunks: AgentResponseChunk[] = [];
    for await (const chunk of gen) {
        chunks.push(chunk);
    }
    return chunks;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('InlineAgentService', () => {
    let service: InlineAgentService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InlineAgentService({ region: 'us-east-1' });
    });

    // ── invokeAgent: streaming response parsing ───────────────────────

    describe('invokeAgent — streaming response parsing', () => {
        it('parses text chunks from the stream', async () => {
            const textBytes = new TextEncoder().encode('Hello world');
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: textBytes } },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            expect(chunks).toHaveLength(2); // text + complete
            expect(chunks[0]).toEqual({
                type: 'text',
                text: 'Hello world',
                isComplete: false,
            });
            expect(chunks[1]).toEqual({ type: 'complete', isComplete: true });
        });

        it('parses multiple text chunks in sequence', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('Part 1') } },
                    { chunk: { bytes: new TextEncoder().encode(' Part 2') } },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks).toHaveLength(2);
            expect(textChunks[0].text).toBe('Part 1');
            expect(textChunks[1].text).toBe(' Part 2');
        });

        it('parses return_control events with function invocation', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-1',
                            invocationInputs: [
                                {
                                    functionInvocationInput: {
                                        actionGroup: 'TestTools',
                                        function: 'search',
                                        parameters: [
                                            { name: 'query', value: 'test query' },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const rcChunks = chunks.filter((c) => c.type === 'return_control');
            expect(rcChunks).toHaveLength(1);
            expect(rcChunks[0].returnControl).toEqual({
                invocationId: 'inv-1',
                actionGroup: 'TestTools',
                function: 'search',
                parameters: { query: 'test query' },
            });
        });

        it('parses trace events (pre-processing)', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        trace: {
                            trace: {
                                preProcessingTrace: {
                                    modelInvocationOutput: {
                                        parsedResponse: { rationale: 'User wants to search' },
                                    },
                                },
                            },
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const traceChunks = chunks.filter((c) => c.type === 'trace');
            expect(traceChunks).toHaveLength(1);
            expect(traceChunks[0].trace).toEqual({
                step: 'pre_processing',
                reasoning: 'User wants to search',
            });
        });

        it('parses trace events (orchestration rationale)', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        trace: {
                            trace: {
                                orchestrationTrace: {
                                    rationale: { text: 'I should search for documents' },
                                },
                            },
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const traceChunks = chunks.filter((c) => c.type === 'trace');
            expect(traceChunks[0].trace).toEqual({
                step: 'orchestration_rationale',
                reasoning: 'I should search for documents',
            });
        });

        it('parses trace events (orchestration invocation)', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        trace: {
                            trace: {
                                orchestrationTrace: {
                                    invocationInput: {
                                        functionInvocationInput: {
                                            function: 'search',
                                            parameters: [{ name: 'query', value: 'test' }],
                                        },
                                    },
                                },
                            },
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const traceChunks = chunks.filter((c) => c.type === 'trace');
            expect(traceChunks[0].trace?.step).toBe('orchestration_invocation');
            expect(traceChunks[0].trace?.toolUse?.name).toBe('search');
            expect(traceChunks[0].trace?.toolUse?.input).toEqual({ query: 'test' });
        });

        it('parses trace events (orchestration observation)', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        trace: {
                            trace: {
                                orchestrationTrace: {
                                    observation: {
                                        finalResponse: { text: 'Here is the answer' },
                                    },
                                },
                            },
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const traceChunks = chunks.filter((c) => c.type === 'trace');
            expect(traceChunks[0].trace).toEqual({
                step: 'orchestration_observation',
                observation: 'Here is the answer',
            });
        });

        it('parses trace events (post-processing)', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        trace: {
                            trace: {
                                postProcessingTrace: {
                                    modelInvocationOutput: {
                                        parsedResponse: { text: 'Refined answer' },
                                    },
                                },
                            },
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const traceChunks = chunks.filter((c) => c.type === 'trace');
            expect(traceChunks[0].trace).toEqual({
                step: 'post_processing',
                reasoning: 'Refined answer',
            });
        });

        it('parses file output events', async () => {
            const fileBytes = new Uint8Array([1, 2, 3]);
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        files: {
                            files: [
                                { name: 'report.pdf', type: 'application/pdf', bytes: fileBytes },
                            ],
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const fileChunks = chunks.filter((c) => c.type === 'files');
            expect(fileChunks).toHaveLength(1);
            expect(fileChunks[0].files).toHaveLength(1);
            expect(fileChunks[0].files![0].name).toBe('report.pdf');
            expect(fileChunks[0].files![0].type).toBe('application/pdf');
        });

        it('throws when no completion stream is returned', async () => {
            mockSend.mockResolvedValueOnce({ completion: undefined });

            await expect(collectChunks(service.invokeAgent(makeRequest()))).rejects.toThrow(
                'No completion stream received',
            );
        });

        it('always emits a complete chunk at the end', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('text') } },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const last = chunks[chunks.length - 1];
            expect(last.type).toBe('complete');
            expect(last.isComplete).toBe(true);
        });

        it('handles empty stream gracefully', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toEqual({ type: 'complete', isComplete: true });
        });

        it('skips return_control invocations without functionInvocationInput', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-1',
                            invocationInputs: [{ /* no functionInvocationInput */ }],
                        },
                    },
                ]),
            });

            const chunks = await collectChunks(service.invokeAgent(makeRequest()));

            const rcChunks = chunks.filter((c) => c.type === 'return_control');
            expect(rcChunks).toHaveLength(0);
        });
    });


    // ── invokeAgentWithToolLoop: RETURN_CONTROL loop ──────────────────

    describe('invokeAgentWithToolLoop — RETURN_CONTROL loop', () => {
        it('executes a single tool call and continues the agent loop', async () => {
            const toolExecutor = vi.fn().mockResolvedValue({ body: 'tool result' });

            // First invocation: agent requests a tool call
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-1',
                            invocationInputs: [
                                {
                                    functionInvocationInput: {
                                        actionGroup: 'TestTools',
                                        function: 'search',
                                        parameters: [{ name: 'query', value: 'hello' }],
                                    },
                                },
                            ],
                        },
                    },
                ]),
            });

            // Second invocation: agent returns final text
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('Final answer') } },
                ]),
            });

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor),
            );

            // Tool executor was called with correct args
            expect(toolExecutor).toHaveBeenCalledWith('TestTools', 'search', { query: 'hello' });

            // Should have: return_control, text, complete
            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks.some((c) => c.text === 'Final answer')).toBe(true);

            // Second send call should include returnControlInvocationResults
            const secondCall = mockSend.mock.calls[1][0];
            expect(secondCall.input.inlineSessionState).toMatchObject({
                invocationId: 'inv-1',
                returnControlInvocationResults: [
                    {
                        functionResult: {
                            actionGroup: 'TestTools',
                            function: 'search',
                            responseBody: { TEXT: { body: 'tool result' } },
                        },
                    },
                ],
            });

            // inputText should be undefined on continuation calls
            expect(secondCall.input.inputText).toBeUndefined();
        });

        it('handles multiple sequential tool calls', async () => {
            const toolExecutor = vi.fn()
                .mockResolvedValueOnce({ body: 'result 1' })
                .mockResolvedValueOnce({ body: 'result 2' });

            // First invocation: tool call 1
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-1',
                            invocationInputs: [
                                {
                                    functionInvocationInput: {
                                        actionGroup: 'TestTools',
                                        function: 'search',
                                        parameters: [{ name: 'query', value: 'first' }],
                                    },
                                },
                            ],
                        },
                    },
                ]),
            });

            // Second invocation: tool call 2
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-2',
                            invocationInputs: [
                                {
                                    functionInvocationInput: {
                                        actionGroup: 'TestTools',
                                        function: 'search',
                                        parameters: [{ name: 'query', value: 'second' }],
                                    },
                                },
                            ],
                        },
                    },
                ]),
            });

            // Third invocation: final response
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('Done') } },
                ]),
            });

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor),
            );

            expect(toolExecutor).toHaveBeenCalledTimes(2);
            expect(mockSend).toHaveBeenCalledTimes(3);

            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks.some((c) => c.text === 'Done')).toBe(true);
        });

        it('handles tool execution errors gracefully', async () => {
            const toolExecutor = vi.fn().mockRejectedValue(new Error('Tool crashed'));

            // First invocation: agent requests a tool call
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    {
                        returnControl: {
                            invocationId: 'inv-1',
                            invocationInputs: [
                                {
                                    functionInvocationInput: {
                                        actionGroup: 'TestTools',
                                        function: 'search',
                                        parameters: [{ name: 'query', value: 'fail' }],
                                    },
                                },
                            ],
                        },
                    },
                ]),
            });

            // Second invocation: agent handles the error and responds
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('Sorry, tool failed') } },
                ]),
            });

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor),
            );

            // Error result should be passed back to the agent
            const secondCall = mockSend.mock.calls[1][0];
            expect(secondCall.input.inlineSessionState.returnControlInvocationResults[0])
                .toMatchObject({
                    functionResult: {
                        responseBody: {
                            TEXT: { body: expect.stringContaining('Tool execution error: Tool crashed') },
                        },
                    },
                });
        });

        it('completes immediately when no return_control is requested', async () => {
            const toolExecutor = vi.fn();

            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('Direct answer') } },
                ]),
            });

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor),
            );

            expect(toolExecutor).not.toHaveBeenCalled();
            expect(mockSend).toHaveBeenCalledTimes(1);

            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks[0].text).toBe('Direct answer');
        });

        it('throws when completion stream is missing during tool loop', async () => {
            mockSend.mockResolvedValueOnce({ completion: undefined });

            const toolExecutor = vi.fn();

            await expect(
                collectChunks(service.invokeAgentWithToolLoop(makeRequest(), toolExecutor)),
            ).rejects.toThrow('No completion stream received');
        });
    });

    // ── Max iteration limit enforcement ───────────────────────────────

    describe('invokeAgentWithToolLoop — max iteration limit', () => {
        it('stops after maxIterations tool calls', async () => {
            const toolExecutor = vi.fn().mockResolvedValue({ body: 'ok' });

            // Set up 3 consecutive return_control responses (limit will be 2)
            for (let i = 0; i < 3; i++) {
                mockSend.mockResolvedValueOnce({
                    completion: asyncIterableFrom([
                        {
                            returnControl: {
                                invocationId: `inv-${i}`,
                                invocationInputs: [
                                    {
                                        functionInvocationInput: {
                                            actionGroup: 'TestTools',
                                            function: 'search',
                                            parameters: [{ name: 'query', value: `q${i}` }],
                                        },
                                    },
                                ],
                            },
                        },
                    ]),
                });
            }

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor, {
                    maxIterations: 2,
                }),
            );

            // Should have executed 2 tool calls, then hit the limit
            expect(toolExecutor).toHaveBeenCalledTimes(2);

            // Should emit a warning text and complete chunk
            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks.some((c) => c.text?.includes('maximum number of tool calls'))).toBe(true);

            // The last chunk should be a complete signal
            const last = chunks[chunks.length - 1];
            expect(last.type).toBe('complete');
            expect(last.isComplete).toBe(true);
        });

        it('uses default maxIterations of 10', async () => {
            const toolExecutor = vi.fn().mockResolvedValue({ body: 'ok' });

            // Set up 11 consecutive return_control responses
            for (let i = 0; i < 11; i++) {
                mockSend.mockResolvedValueOnce({
                    completion: asyncIterableFrom([
                        {
                            returnControl: {
                                invocationId: `inv-${i}`,
                                invocationInputs: [
                                    {
                                        functionInvocationInput: {
                                            actionGroup: 'TestTools',
                                            function: 'search',
                                            parameters: [{ name: 'query', value: `q${i}` }],
                                        },
                                    },
                                ],
                            },
                        },
                    ]),
                });
            }

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor),
            );

            // Default limit is 10
            expect(toolExecutor).toHaveBeenCalledTimes(10);
        });

        it('does not count iterations when no tool calls are made', async () => {
            const toolExecutor = vi.fn();

            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([
                    { chunk: { bytes: new TextEncoder().encode('No tools needed') } },
                ]),
            });

            const chunks = await collectChunks(
                service.invokeAgentWithToolLoop(makeRequest(), toolExecutor, {
                    maxIterations: 1,
                }),
            );

            expect(toolExecutor).not.toHaveBeenCalled();
            const textChunks = chunks.filter((c) => c.type === 'text');
            expect(textChunks[0].text).toBe('No tools needed');
        });
    });

    // ── SDK action group conversion ───────────────────────────────────

    describe('toSdkActionGroup — action group conversion', () => {
        it('passes action groups to the SDK command correctly', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            const ag: ActionGroupConfig = {
                actionGroupName: 'MyTools',
                description: 'My tools',
                actionGroupExecutor: { customControl: 'RETURN_CONTROL' },
                functionSchema: {
                    functions: [
                        {
                            name: 'doThing',
                            description: 'Does a thing',
                            parameters: {
                                input: { type: 'string', description: 'The input', required: true },
                                optional: { type: 'integer', description: 'Optional param', required: false },
                            },
                        },
                    ],
                },
            };

            await collectChunks(service.invokeAgent(makeRequest({ actionGroups: [ag] })));

            const command = mockSend.mock.calls[0][0];
            const sdkAg = command.input.actionGroups[0];

            expect(sdkAg.actionGroupName).toBe('MyTools');
            expect(sdkAg.description).toBe('My tools');
            expect(sdkAg.actionGroupExecutor).toEqual({ customControl: 'RETURN_CONTROL' });
            expect(sdkAg.functionSchema.functions[0].name).toBe('doThing');
            expect(sdkAg.functionSchema.functions[0].parameters.input).toEqual({
                type: 'string',
                description: 'The input',
                required: true,
            });
            expect(sdkAg.functionSchema.functions[0].parameters.optional).toEqual({
                type: 'integer',
                description: 'Optional param',
                required: false,
            });
        });

        it('handles action groups without executor', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            const ag: ActionGroupConfig = {
                actionGroupName: 'NoExecutor',
                description: 'No executor',
                functionSchema: { functions: [] },
            };

            await collectChunks(service.invokeAgent(makeRequest({ actionGroups: [ag] })));

            const command = mockSend.mock.calls[0][0];
            expect(command.input.actionGroups[0].actionGroupExecutor).toBeUndefined();
        });
    });

    // ── Request construction ──────────────────────────────────────────

    describe('request construction', () => {
        it('passes session attributes to the SDK command', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            await collectChunks(
                service.invokeAgent(
                    makeRequest({ sessionAttributes: { key: 'value' } }),
                ),
            );

            const command = mockSend.mock.calls[0][0];
            expect(command.input.inlineSessionState).toEqual({
                sessionAttributes: { key: 'value' },
            });
        });

        it('omits inlineSessionState when no session attributes', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            await collectChunks(service.invokeAgent(makeRequest({ sessionAttributes: undefined })));

            const command = mockSend.mock.calls[0][0];
            expect(command.input.inlineSessionState).toBeUndefined();
        });

        it('defaults enableTrace to false', async () => {
            mockSend.mockResolvedValueOnce({
                completion: asyncIterableFrom([]),
            });

            await collectChunks(service.invokeAgent(makeRequest()));

            const command = mockSend.mock.calls[0][0];
            expect(command.input.enableTrace).toBe(false);
        });
    });
});
