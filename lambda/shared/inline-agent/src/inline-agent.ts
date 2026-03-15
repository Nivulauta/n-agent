/**
 * Inline Agent Service — Bedrock InvokeInlineAgent with streaming response parsing.
 *
 * Invokes the Bedrock InvokeInlineAgent API and yields AgentResponseChunk objects
 * for each event in the streaming response (text chunks, traces, return-control, files).
 *
 * Implements Requirement 14.1 from the design specification.
 */

import {
    BedrockAgentRuntimeClient,
    InvokeInlineAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type {
    AgentActionGroup,
    FunctionSchema,
    ActionGroupExecutor,
    ParameterDetail,
    InlineSessionState,
    InvocationResultMember,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type {
    InlineAgentRequest,
    AgentResponseChunk,
    InlineAgentConfig,
    ActionGroupConfig,
    ToolExecutorFn,
    AgentLoopOptions,
    ReturnControlPayload,
} from './types.js';

export class InlineAgentService {
    private client: BedrockAgentRuntimeClient;

    constructor(config: InlineAgentConfig = {}) {
        this.client = new BedrockAgentRuntimeClient({
            region: config.region || process.env.AWS_REGION || 'us-east-1',
        });
    }

    /**
     * Invoke the Bedrock InlineAgent and yield streaming response chunks.
     *
     * Parses the streaming response and emits typed AgentResponseChunk objects
     * for each event: text content, agent traces, return-control requests, and file outputs.
     */
    async *invokeAgent(request: InlineAgentRequest): AsyncGenerator<AgentResponseChunk> {
        const actionGroups: AgentActionGroup[] = request.actionGroups.map(
            (ag) => this.toSdkActionGroup(ag)
        );

        const command = new InvokeInlineAgentCommand({
            sessionId: request.sessionId,
            inputText: request.inputText,
            foundationModel: request.foundationModel,
            instruction: request.instruction,
            enableTrace: request.enableTrace ?? false,
            actionGroups,
            inlineSessionState: request.sessionAttributes
                ? { sessionAttributes: request.sessionAttributes }
                : undefined,
        });

        const response = await this.client.send(command);

        if (!response.completion) {
            throw new Error('No completion stream received from InvokeInlineAgent');
        }

        yield* this.parseStream(response.completion);
    }

    /**
     * Invoke the agent with an automatic RETURN_CONTROL tool execution loop.
     *
     * When the agent yields a return_control event, this method:
     * 1. Calls the provided toolExecutor to execute the tool
     * 2. Formats the result as returnControlInvocationResults
     * 3. Re-invokes InvokeInlineAgent with the results to continue the agent loop
     *
     * Text, trace, and file chunks are yielded through to the caller in real-time.
     * The loop terminates when the agent completes without requesting more tools,
     * or when the max iteration limit is reached.
     */
    async *invokeAgentWithToolLoop(
        request: InlineAgentRequest,
        toolExecutor: ToolExecutorFn,
        options: AgentLoopOptions = {},
    ): AsyncGenerator<AgentResponseChunk> {
        const maxIterations = options.maxIterations ?? 10;
        let iteration = 0;

        const actionGroups: AgentActionGroup[] = request.actionGroups.map(
            (ag) => this.toSdkActionGroup(ag),
        );

        // First invocation — normal request with inputText
        let sessionState: InlineSessionState | undefined = request.sessionAttributes
            ? { sessionAttributes: request.sessionAttributes }
            : undefined;

        let inputText: string | undefined = request.inputText;
        let pendingReturnControl: ReturnControlPayload | undefined;

        while (iteration <= maxIterations) {
            const command = new InvokeInlineAgentCommand({
                sessionId: request.sessionId,
                inputText,
                foundationModel: request.foundationModel,
                instruction: request.instruction,
                enableTrace: request.enableTrace ?? false,
                actionGroups,
                inlineSessionState: sessionState,
            });

            const response = await this.client.send(command);

            if (!response.completion) {
                throw new Error('No completion stream received from InvokeInlineAgent');
            }

            // Collect return_control events from this invocation
            pendingReturnControl = undefined;

            for await (const chunk of this.parseStream(response.completion)) {
                if (chunk.type === 'return_control' && chunk.returnControl) {
                    pendingReturnControl = chunk.returnControl;
                    // Yield the return_control chunk so callers can observe tool calls
                    yield chunk;
                } else {
                    yield chunk;
                }
            }

            // If no return_control was requested, the agent is done
            if (!pendingReturnControl) {
                return;
            }

            // Check iteration limit before executing the tool
            iteration++;
            if (iteration > maxIterations) {
                console.warn(
                    `[InlineAgent] Max iteration limit (${maxIterations}) reached, stopping agent loop`,
                );
                yield {
                    type: 'text',
                    text: 'I reached the maximum number of tool calls for this turn. Here is what I have so far.',
                    isComplete: false,
                };
                yield { type: 'complete', isComplete: true };
                return;
            }

            // Execute the tool
            const { actionGroup, function: functionName, parameters, invocationId } =
                pendingReturnControl;

            let toolResult: { body: string; isError?: boolean };
            try {
                toolResult = await toolExecutor(actionGroup, functionName, parameters);
            } catch (err: any) {
                toolResult = {
                    body: `Tool execution error: ${err.message ?? String(err)}`,
                    isError: true,
                };
            }

            // Build returnControlInvocationResults for the next invocation
            const invocationResult: InvocationResultMember = {
                functionResult: {
                    actionGroup,
                    function: functionName,
                    responseBody: {
                        TEXT: { body: toolResult.body },
                    },
                },
            };

            sessionState = {
                invocationId,
                returnControlInvocationResults: [invocationResult],
                ...(request.sessionAttributes
                    ? { sessionAttributes: request.sessionAttributes }
                    : {}),
            };

            // On continuation calls, inputText should be empty
            inputText = undefined;
        }
    }

    /**
     * Convert our ActionGroupConfig to the SDK's AgentActionGroup type,
     * handling the discriminated union shapes for FunctionSchema and ActionGroupExecutor.
     */
    private toSdkActionGroup(ag: ActionGroupConfig): AgentActionGroup {
        const executor: ActionGroupExecutor | undefined = ag.actionGroupExecutor
            ? { customControl: ag.actionGroupExecutor.customControl }
            : undefined;

        const functionSchema: FunctionSchema = {
            functions: ag.functionSchema.functions.map((fn) => ({
                name: fn.name,
                description: fn.description,
                parameters: Object.fromEntries(
                    Object.entries(fn.parameters).map(([key, param]) => {
                        const detail: ParameterDetail = {
                            type: param.type as ParameterDetail['type'],
                            description: param.description,
                            required: param.required,
                        };
                        return [key, detail];
                    })
                ),
            })),
        };

        return {
            actionGroupName: ag.actionGroupName,
            description: ag.description,
            actionGroupExecutor: executor,
            functionSchema,
        };
    }

    /**
     * Parse the InvokeInlineAgent streaming response into typed chunks.
     */
    private async *parseStream(
        stream: AsyncIterable<any>
    ): AsyncGenerator<AgentResponseChunk> {
        for await (const event of stream) {
            // Text chunk from the agent's response
            if (event.chunk?.bytes) {
                const text = new TextDecoder().decode(event.chunk.bytes);
                yield { type: 'text', text, isComplete: false };
            }

            // Agent trace event (reasoning, tool use, observations)
            if (event.trace?.trace) {
                const trace = event.trace.trace;
                yield {
                    type: 'trace',
                    trace: this.parseTrace(trace),
                    isComplete: false,
                };
            }

            // Return control — agent wants to execute a tool
            if (event.returnControl) {
                const rc = event.returnControl;
                const invocations = rc.invocationInputs ?? [];
                for (const invocation of invocations) {
                    const funcInvocation = invocation.functionInvocationInput;
                    if (!funcInvocation) continue;

                    const parameters: Record<string, string> = {};
                    for (const param of funcInvocation.parameters ?? []) {
                        if (param.name && param.value !== undefined) {
                            parameters[param.name] = param.value;
                        }
                    }

                    yield {
                        type: 'return_control',
                        returnControl: {
                            invocationId: rc.invocationId ?? '',
                            actionGroup: funcInvocation.actionGroup ?? '',
                            function: funcInvocation.function ?? '',
                            parameters,
                        },
                        isComplete: false,
                    };
                }
            }

            // File output from the agent
            if (event.files?.files) {
                const files = event.files.files.map((f: any) => ({
                    name: f.name ?? 'unknown',
                    type: f.type ?? 'application/octet-stream',
                    bytes: f.bytes ?? new Uint8Array(),
                }));
                yield { type: 'files', files, isComplete: false };
            }
        }

        // Signal stream completion
        yield { type: 'complete', isComplete: true };
    }

    /**
     * Extract structured trace information from the raw Bedrock trace object.
     */
    private parseTrace(trace: any): {
        step: string;
        reasoning?: string;
        toolUse?: { name: string; input: Record<string, any> };
        observation?: string;
    } {
        // Pre-processing trace (input parsing)
        if (trace.preProcessingTrace) {
            const output = trace.preProcessingTrace.modelInvocationOutput;
            return {
                step: 'pre_processing',
                reasoning: output?.parsedResponse?.rationale,
            };
        }

        // Orchestration trace (reasoning + tool use)
        if (trace.orchestrationTrace) {
            const orch = trace.orchestrationTrace;

            if (orch.rationale?.text) {
                return {
                    step: 'orchestration_rationale',
                    reasoning: orch.rationale.text,
                };
            }

            if (orch.invocationInput) {
                const inv = orch.invocationInput;
                return {
                    step: 'orchestration_invocation',
                    toolUse: {
                        name: inv.functionInvocationInput?.function ?? inv.actionGroupInvocationInput?.actionGroupName ?? 'unknown',
                        input: this.extractToolInput(inv),
                    },
                };
            }

            if (orch.observation) {
                return {
                    step: 'orchestration_observation',
                    observation: orch.observation.finalResponse?.text
                        ?? orch.observation.actionGroupInvocationOutput?.text
                        ?? JSON.stringify(orch.observation),
                };
            }

            return { step: 'orchestration' };
        }

        // Post-processing trace
        if (trace.postProcessingTrace) {
            const output = trace.postProcessingTrace.modelInvocationOutput;
            return {
                step: 'post_processing',
                reasoning: output?.parsedResponse?.text,
            };
        }

        return { step: 'unknown' };
    }

    /**
     * Extract tool input parameters from an invocation input object.
     */
    private extractToolInput(invocationInput: any): Record<string, any> {
        const funcInput = invocationInput.functionInvocationInput;
        if (!funcInput?.parameters) return {};

        const result: Record<string, any> = {};
        for (const param of funcInput.parameters) {
            if (param.name) {
                result[param.name] = param.value;
            }
        }
        return result;
    }
}
