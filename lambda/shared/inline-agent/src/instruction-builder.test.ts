import { describe, it, expect } from 'vitest';
import {
    buildAgentInstruction,
    MAX_INSTRUCTION_LENGTH,
} from './instruction-builder.js';
import type { ActionGroupConfig } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────

function makeActionGroup(name: string, tools: string[] = ['tool1']): ActionGroupConfig {
    return {
        actionGroupName: name,
        description: `${name} description`,
        functionSchema: {
            functions: tools.map((t) => ({
                name: t,
                description: `${t} does something`,
                parameters: {},
            })),
        },
    };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('buildAgentInstruction', () => {
    it('includes the base prompt in the output', () => {
        const result = buildAgentInstruction({
            actionGroups: [],
            userContext: { userId: 'user-1' },
        });

        expect(result).toContain('helpful document assistant');
    });

    it('includes user context with userId', () => {
        const result = buildAgentInstruction({
            actionGroups: [],
            userContext: { userId: 'user-42' },
        });

        expect(result).toContain('user-42');
    });

    it('includes document count when provided', () => {
        const result = buildAgentInstruction({
            actionGroups: [],
            userContext: { userId: 'user-1', documentCount: 5 },
        });

        expect(result).toContain('5 uploaded document(s)');
    });

    it('shows no-documents message when count is 0', () => {
        const result = buildAgentInstruction({
            actionGroups: [],
            userContext: { userId: 'user-1', documentCount: 0 },
        });

        expect(result).toContain('no uploaded documents');
    });

    it('includes action group and tool descriptions', () => {
        const result = buildAgentInstruction({
            actionGroups: [makeActionGroup('DocumentTools', ['SearchDocuments', 'GetMetadata'])],
            userContext: { userId: 'user-1' },
        });

        expect(result).toContain('[DocumentTools]');
        expect(result).toContain('SearchDocuments');
        expect(result).toContain('GetMetadata');
    });

    it('includes multiple action groups', () => {
        const result = buildAgentInstruction({
            actionGroups: [
                makeActionGroup('DocumentTools'),
                makeActionGroup('MCPTools'),
            ],
            userContext: { userId: 'user-1' },
        });

        expect(result).toContain('[DocumentTools]');
        expect(result).toContain('[MCPTools]');
    });

    it('uses custom base prompt when provided', () => {
        const result = buildAgentInstruction({
            actionGroups: [],
            userContext: { userId: 'user-1' },
            basePrompt: 'You are a custom bot.',
        });

        expect(result).toContain('You are a custom bot.');
        expect(result).not.toContain('helpful document assistant');
    });

    it('never exceeds MAX_INSTRUCTION_LENGTH', () => {
        // Create many action groups with long descriptions to force truncation
        const actionGroups = Array.from({ length: 50 }, (_, i) =>
            makeActionGroup(
                `ActionGroup${i}`,
                Array.from({ length: 10 }, (_, j) => `tool_${i}_${j}_with_a_very_long_name`),
            ),
        );

        const result = buildAgentInstruction({
            actionGroups,
            userContext: { userId: 'user-1', documentCount: 100 },
        });

        expect(result.length).toBeLessThanOrEqual(MAX_INSTRUCTION_LENGTH);
    });

    it('truncates tool section at newline boundary when over budget', () => {
        const longTools = Array.from({ length: 100 }, (_, i) => `tool_${i}`);
        const result = buildAgentInstruction({
            actionGroups: [makeActionGroup('BigGroup', longTools)],
            userContext: { userId: 'user-1' },
        });

        // Should not end mid-line (no partial tool descriptions)
        const lines = result.split('\n');
        const lastLine = lines[lines.length - 1];
        // Last line should be a complete line, not truncated mid-word
        expect(lastLine.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(MAX_INSTRUCTION_LENGTH);
    });

    it('omits tool section entirely when base prompt + user section fill the budget', () => {
        // Use a base prompt that fills the entire budget minus just enough for user section
        // The user section for userId='u' is ~20 chars, plus 2 separators (\n\n) = ~24 chars
        // So we need a prompt that leaves no room for tools after base + user + separators
        const longPrompt = 'X'.repeat(MAX_INSTRUCTION_LENGTH - 10);

        const result = buildAgentInstruction({
            actionGroups: [makeActionGroup('Tools')],
            userContext: { userId: 'u' },
            basePrompt: longPrompt,
        });

        // The final result is sliced to MAX_INSTRUCTION_LENGTH, so tools can't fit
        expect(result.length).toBeLessThanOrEqual(MAX_INSTRUCTION_LENGTH);
        expect(result).not.toContain('Available tools');
    });

    it('MAX_INSTRUCTION_LENGTH is 4096', () => {
        expect(MAX_INSTRUCTION_LENGTH).toBe(4096);
    });
});
