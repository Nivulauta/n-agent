/**
 * Types for the Inline Agent Service module.
 */

/** Configuration for a Bedrock action group */
export interface ActionGroupConfig {
    actionGroupName: string;
    description: string;
    actionGroupExecutor?: {
        customControl: 'RETURN_CONTROL';
    };
    functionSchema: {
        functions: FunctionDefinition[];
    };
}

/** Function definition within an action group */
export interface FunctionDefinition {
    name: string;
    description: string;
    parameters: Record<
        string,
        {
            type: string;
            description: string;
            required: boolean;
        }
    >;
}

/** Conversation message for agent session history */
export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

/** Request to invoke the inline agent */
export interface InlineAgentRequest {
    /** The user's query text */
    inputText: string;
    /** Session ID for multi-turn conversations */
    sessionId: string;
    /** User ID for context */
    userId: string;
    /** Agent instruction/system prompt */
    instruction: string;
    /** Bedrock foundation model ID */
    foundationModel: string;
    /** Action groups (built-in + MCP-derived) */
    actionGroups: ActionGroupConfig[];
    /** Optional conversation history */
    conversationHistory?: ConversationMessage[];
    /** Enable agent trace for debugging */
    enableTrace?: boolean;
    /** Session attributes passed to the agent */
    sessionAttributes?: Record<string, string>;
}

/** A chunk of the agent's streaming response */
export interface AgentResponseChunk {
    type: 'text' | 'trace' | 'return_control' | 'files' | 'complete';
    /** Text content for 'text' type */
    text?: string;
    /** Trace data for 'trace' type */
    trace?: AgentTrace;
    /** Return control payload for 'return_control' type */
    returnControl?: ReturnControlPayload;
    /** File output for 'files' type */
    files?: AgentFileOutput[];
    /** Whether this is the final chunk */
    isComplete: boolean;
}

/** Trace information from the agent's reasoning */
export interface AgentTrace {
    step: string;
    reasoning?: string;
    toolUse?: { name: string; input: Record<string, any> };
    observation?: string;
}

/** Payload when the agent returns control for tool execution */
export interface ReturnControlPayload {
    invocationId: string;
    actionGroup: string;
    function: string;
    parameters: Record<string, string>;
}

/** File output from the agent */
export interface AgentFileOutput {
    name: string;
    type: string;
    bytes: Uint8Array;
}

/** Configuration for the InlineAgentService */
export interface InlineAgentConfig {
    /** AWS region */
    region?: string;
}

/** Result of executing a tool (built-in or MCP) */
export interface ToolExecutionResult {
    /** Text content returned by the tool */
    body: string;
    /** Whether the tool execution encountered an error */
    isError?: boolean;
}

/**
 * Callback that executes a tool invocation from the agent's RETURN_CONTROL event.
 * The caller provides this to route tool calls to built-in executors or MCP bridge.
 */
export type ToolExecutorFn = (
    actionGroup: string,
    functionName: string,
    parameters: Record<string, string>,
) => Promise<ToolExecutionResult>;

/** Options for the agent tool execution loop */
export interface AgentLoopOptions {
    /** Maximum number of tool calls per agent turn (default: 10) */
    maxIterations?: number;
}
