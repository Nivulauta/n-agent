/**
 * Agent Instruction Builder — dynamically builds the `instruction` string
 * for Bedrock InvokeInlineAgent based on available tools and user context.
 *
 * The instruction is kept under 4096 characters (Bedrock limit).
 *
 * Requirements: 14.1
 */

import type { ActionGroupConfig } from './types.js';

/** Maximum instruction length allowed by Bedrock InvokeInlineAgent */
export const MAX_INSTRUCTION_LENGTH = 4096;

/** Context about the current user passed to the instruction builder */
export interface UserContext {
    userId: string;
    /** Number of documents the user has uploaded */
    documentCount?: number;
}

/** Options for building the agent instruction */
export interface InstructionBuilderOptions {
    /** Action groups available to the agent (built-in + MCP-derived) */
    actionGroups: ActionGroupConfig[];
    /** Current user context */
    userContext: UserContext;
    /** Optional custom base prompt override (for testing) */
    basePrompt?: string;
}

const DEFAULT_BASE_PROMPT = `You are a helpful document assistant. You help users find information in their uploaded documents, answer questions based on document content, and manage their document library.

Guidelines:
- Use the available tools to search documents and retrieve information before answering.
- Always cite the source document name and page number when referencing document content.
- If no relevant documents are found, say so clearly and offer to help differently.
- Be concise and accurate. Do not fabricate information not found in the documents.
- For multi-step questions, break them down and use tools iteratively.`;

/**
 * Build the agent instruction string dynamically.
 *
 * Combines a base system prompt, a summary of available tools, and user context.
 * Truncates tool descriptions if the total exceeds the Bedrock 4096-char limit.
 */
export function buildAgentInstruction(options: InstructionBuilderOptions): string {
    const { actionGroups, userContext, basePrompt } = options;
    const base = basePrompt ?? DEFAULT_BASE_PROMPT;

    const userSection = buildUserSection(userContext);
    const toolSection = buildToolSection(actionGroups);

    // Calculate budget: base + user section + separators, rest goes to tools
    const separator = '\n\n';
    const fixedParts = base + separator + userSection + separator;
    const budgetForTools = MAX_INSTRUCTION_LENGTH - fixedParts.length;

    const trimmedToolSection =
        budgetForTools > 0 ? truncateToLength(toolSection, budgetForTools) : '';

    const instruction = trimmedToolSection
        ? fixedParts + trimmedToolSection
        : base + separator + userSection;

    return instruction.slice(0, MAX_INSTRUCTION_LENGTH);
}

function buildUserSection(ctx: UserContext): string {
    const parts = [`Current user ID: ${ctx.userId}`];
    if (ctx.documentCount !== undefined) {
        parts.push(
            ctx.documentCount > 0
                ? `The user has ${ctx.documentCount} uploaded document(s) available for search.`
                : 'The user has no uploaded documents yet.',
        );
    }
    return parts.join(' ');
}

function buildToolSection(actionGroups: ActionGroupConfig[]): string {
    if (actionGroups.length === 0) return '';

    const lines = ['Available tools:'];
    for (const ag of actionGroups) {
        lines.push(`[${ag.actionGroupName}] ${ag.description}`);
        for (const fn of ag.functionSchema.functions) {
            lines.push(`  - ${fn.name}: ${fn.description}`);
        }
    }
    return lines.join('\n');
}

/**
 * Truncate a string to fit within maxLen, cutting at the last newline
 * boundary to avoid mid-line breaks.
 */
function truncateToLength(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;

    const truncated = text.slice(0, maxLen);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
}
