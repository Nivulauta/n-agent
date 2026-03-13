/**
 * Unit tests for CloudWatch Metrics Emitter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    MetricsEmitter,
    getMetricsEmitter,
    emitExecutionDuration,
    emitQueryLatency,
    emitEmbeddingGenerationTime,
    emitSearchLatency,
    emitTokenUsage,
    flushMetrics,
} from './metrics.js';
import { MetricUnit } from './types.js';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

// Mock AWS SDK
vi.mock('@aws-sdk/client-cloudwatch', () => {
    const mockSend = vi.fn();
    return {
        CloudWatchClient: vi.fn(() => ({
            send: mockSend,
        })),
        PutMetricDataCommand: vi.fn((input) => input),
        StandardUnit: {
            Seconds: 'Seconds',
            Milliseconds: 'Milliseconds',
            Count: 'Count',
        },
    };
});

describe('MetricsEmitter', () => {
    let mockSend: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Get the mock send function
        const client = new CloudWatchClient({});
        mockSend = client.send as any;

        // Mock successful CloudWatch responses
        mockSend.mockResolvedValue({});
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    describe('Constructor', () => {
        it('should create instance with default config', () => {
            const emitter = new MetricsEmitter();
            expect(emitter).toBeInstanceOf(MetricsEmitter);
        });

        it('should create instance with custom config', () => {
            const emitter = new MetricsEmitter({
                namespace: 'CustomNamespace',
                region: 'us-west-2',
                consoleLogging: false,
            });
            expect(emitter).toBeInstanceOf(MetricsEmitter);
        });

        it('should use default dimensions', () => {
            const emitter = new MetricsEmitter({
                defaultDimensions: [
                    { Name: 'Environment', Value: 'production' },
                ],
            });
            expect(emitter).toBeInstanceOf(MetricsEmitter);
        });
    });

    describe('emitExecutionDuration', () => {
        it('should emit execution duration metric', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitExecutionDuration({
                functionName: 'test-function',
                duration: 1500,
            });

            // Flush to send metrics
            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.Namespace).toBe('ChatbotMetrics');
            expect(command.MetricData).toHaveLength(1);
            expect(command.MetricData[0].MetricName).toBe('ExecutionDuration');
            expect(command.MetricData[0].Value).toBe(1500);
            expect(command.MetricData[0].Unit).toBe('Milliseconds');
        });

        it('should include userId dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitExecutionDuration({
                functionName: 'test-function',
                duration: 1500,
                userId: 'user-123',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'UserId', Value: 'user-123' });
        });

        it('should include functionName dimension', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitExecutionDuration({
                functionName: 'chat-handler',
                duration: 2000,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'FunctionName', Value: 'chat-handler' });
        });
    });

    describe('emitQueryLatency', () => {
        it('should emit query latency metric', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({
                latency: 500,
            });

            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData[0].MetricName).toBe('QueryLatency');
            expect(command.MetricData[0].Value).toBe(500);
            expect(command.MetricData[0].Unit).toBe('Milliseconds');
        });

        it('should include cached dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({
                latency: 100,
                cached: true,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'Cached', Value: 'true' });
        });

        it('should include userId dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({
                latency: 500,
                userId: 'user-456',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'UserId', Value: 'user-456' });
        });
    });

    describe('emitEmbeddingGenerationTime', () => {
        it('should emit embedding generation time metric', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitEmbeddingGenerationTime({
                generationTime: 3000,
                chunkCount: 25,
            });

            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData[0].MetricName).toBe('EmbeddingGenerationTime');
            expect(command.MetricData[0].Value).toBe(3000);
            expect(command.MetricData[0].Unit).toBe('Milliseconds');
        });

        it('should include chunkCount dimension', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitEmbeddingGenerationTime({
                generationTime: 3000,
                chunkCount: 50,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'ChunkCount', Value: '50' });
        });

        it('should include documentId dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitEmbeddingGenerationTime({
                generationTime: 3000,
                chunkCount: 25,
                documentId: 'doc-789',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'DocumentId', Value: 'doc-789' });
        });
    });

    describe('emitSearchLatency', () => {
        it('should emit search latency metric', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 5,
            });

            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData[0].MetricName).toBe('SearchLatency');
            expect(command.MetricData[0].Value).toBe(150);
            expect(command.MetricData[0].Unit).toBe('Milliseconds');
        });

        it('should include resultCount dimension', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 10,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'ResultCount', Value: '10' });
        });

        it('should include userId dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 5,
                userId: 'user-999',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'UserId', Value: 'user-999' });
        });
    });

    describe('emitTokenUsage', () => {
        it('should emit token usage metrics', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 100,
                outputTokens: 200,
            });

            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData).toHaveLength(3); // input, output, total

            // Check input tokens
            const inputMetric = command.MetricData.find((m: any) => m.MetricName === 'BedrockInputTokens');
            expect(inputMetric).toBeDefined();
            expect(inputMetric.Value).toBe(100);
            expect(inputMetric.Unit).toBe('Count');

            // Check output tokens
            const outputMetric = command.MetricData.find((m: any) => m.MetricName === 'BedrockOutputTokens');
            expect(outputMetric).toBeDefined();
            expect(outputMetric.Value).toBe(200);
            expect(outputMetric.Unit).toBe('Count');

            // Check total tokens
            const totalMetric = command.MetricData.find((m: any) => m.MetricName === 'BedrockTotalTokens');
            expect(totalMetric).toBeDefined();
            expect(totalMetric.Value).toBe(300);
            expect(totalMetric.Unit).toBe('Count');
        });

        it('should include userId dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 100,
                outputTokens: 200,
                userId: 'user-111',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'UserId', Value: 'user-111' });
        });

        it('should include model dimension when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 100,
                outputTokens: 200,
                model: 'claude-haiku-4.5',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'Model', Value: 'claude-haiku-4.5' });
        });
    });

    describe('Buffering and Flushing', () => {
        it('should buffer metrics and flush when buffer is full', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            // Emit 20 metrics to trigger auto-flush
            for (let i = 0; i < 20; i++) {
                await emitter.emitQueryLatency({ latency: 100 });
            }

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData).toHaveLength(20);
        });

        it('should flush metrics manually', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({ latency: 100 });
            await emitter.emitQueryLatency({ latency: 200 });

            // Manual flush
            await emitter.flush();

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command.MetricData).toHaveLength(2);
        });

        it('should not throw error when CloudWatch write fails', async () => {
            mockSend.mockRejectedValue(new Error('CloudWatch error'));

            const emitter = new MetricsEmitter({ consoleLogging: false });

            await expect(emitter.emitQueryLatency({ latency: 100 })).resolves.not.toThrow();
            await expect(emitter.flush()).resolves.not.toThrow();
        });
    });

    describe('Singleton and Convenience Functions', () => {
        it('should return singleton instance', () => {
            const emitter1 = getMetricsEmitter();
            const emitter2 = getMetricsEmitter();
            expect(emitter1).toBe(emitter2);
        });

        it('should emit execution duration using convenience function', async () => {
            await emitExecutionDuration({
                functionName: 'test-function',
                duration: 1000,
            });

            await flushMetrics();

            expect(mockSend).toHaveBeenCalled();
        });

        it('should emit query latency using convenience function', async () => {
            await emitQueryLatency({
                latency: 500,
            });

            await flushMetrics();

            expect(mockSend).toHaveBeenCalled();
        });

        it('should emit embedding generation time using convenience function', async () => {
            await emitEmbeddingGenerationTime({
                generationTime: 3000,
                chunkCount: 25,
            });

            await flushMetrics();

            expect(mockSend).toHaveBeenCalled();
        });

        it('should emit search latency using convenience function', async () => {
            await emitSearchLatency({
                latency: 150,
                resultCount: 5,
            });

            await flushMetrics();

            expect(mockSend).toHaveBeenCalled();
        });

        it('should emit token usage using convenience function', async () => {
            await emitTokenUsage({
                inputTokens: 100,
                outputTokens: 200,
            });

            await flushMetrics();

            expect(mockSend).toHaveBeenCalled();
        });
    });

    describe('Default Dimensions', () => {
        it('should include default dimensions in all metrics', async () => {
            const emitter = new MetricsEmitter({
                consoleLogging: false,
                defaultDimensions: [
                    { Name: 'Environment', Value: 'production' },
                    { Name: 'Service', Value: 'rag-chatbot' },
                ],
            });

            await emitter.emitQueryLatency({ latency: 500 });
            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const dimensions = command.MetricData[0].Dimensions;
            expect(dimensions).toContainEqual({ Name: 'Environment', Value: 'production' });
            expect(dimensions).toContainEqual({ Name: 'Service', Value: 'rag-chatbot' });
        });
    });

    describe('Metric Data Structure Validation', () => {
        it('should create valid CloudWatch metric data structure for execution duration', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitExecutionDuration({
                functionName: 'test-function',
                duration: 1500,
                userId: 'user-123',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            // Validate command structure
            expect(command).toHaveProperty('Namespace');
            expect(command).toHaveProperty('MetricData');
            expect(command.Namespace).toBe('ChatbotMetrics');
            expect(Array.isArray(command.MetricData)).toBe(true);

            // Validate metric datum structure
            const metricDatum = command.MetricData[0];
            expect(metricDatum).toHaveProperty('MetricName');
            expect(metricDatum).toHaveProperty('Value');
            expect(metricDatum).toHaveProperty('Unit');
            expect(metricDatum).toHaveProperty('Timestamp');
            expect(metricDatum).toHaveProperty('Dimensions');

            // Validate data types
            expect(typeof metricDatum.MetricName).toBe('string');
            expect(typeof metricDatum.Value).toBe('number');
            expect(typeof metricDatum.Unit).toBe('string');
            expect(metricDatum.Timestamp).toBeInstanceOf(Date);
            expect(Array.isArray(metricDatum.Dimensions)).toBe(true);

            // Validate dimensions structure
            metricDatum.Dimensions.forEach((dim: any) => {
                expect(dim).toHaveProperty('Name');
                expect(dim).toHaveProperty('Value');
                expect(typeof dim.Name).toBe('string');
                expect(typeof dim.Value).toBe('string');
            });
        });

        it('should create valid CloudWatch metric data structure for search latency with scores', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 5,
                averageScore: 0.85,
                maxScore: 0.95,
                minScore: 0.75,
                userId: 'user-456',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            // Should emit 4 metrics: latency, average score, max score, min score
            expect(command.MetricData).toHaveLength(4);

            // Validate each metric has proper structure
            command.MetricData.forEach((metricDatum: any) => {
                expect(metricDatum).toHaveProperty('MetricName');
                expect(metricDatum).toHaveProperty('Value');
                expect(metricDatum).toHaveProperty('Unit');
                expect(metricDatum).toHaveProperty('Timestamp');
                expect(metricDatum).toHaveProperty('Dimensions');
                expect(typeof metricDatum.Value).toBe('number');
            });
        });

        it('should create valid CloudWatch metric data structure for token usage', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 100,
                outputTokens: 200,
                userId: 'user-789',
                model: 'claude-haiku-4.5',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            // Should emit 3 metrics: input tokens, output tokens, total tokens
            expect(command.MetricData).toHaveLength(3);

            // Validate all metrics have Count unit
            command.MetricData.forEach((metricDatum: any) => {
                expect(metricDatum.Unit).toBe('Count');
                expect(typeof metricDatum.Value).toBe('number');
                expect(metricDatum.Value).toBeGreaterThan(0);
            });
        });

        it('should handle metrics with no optional dimensions', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({
                latency: 500,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            // Should have dimensions array (even if empty or only default dimensions)
            expect(Array.isArray(metricDatum.Dimensions)).toBe(true);
        });

        it('should preserve metric timestamp when provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });
            const customTimestamp = new Date('2024-01-01T00:00:00Z');

            await emitter.emitMetric({
                metricName: 'CustomMetric',
                value: 100,
                unit: MetricUnit.Count,
                timestamp: customTimestamp,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            expect(metricDatum.Timestamp).toEqual(customTimestamp);
        });
    });

    describe('Metric Values Calculation', () => {
        it('should calculate total tokens correctly', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 150,
                outputTokens: 250,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            // Find the total tokens metric
            const totalTokensMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'BedrockTotalTokens'
            );

            expect(totalTokensMetric).toBeDefined();
            expect(totalTokensMetric.Value).toBe(400); // 150 + 250
        });

        it('should calculate total tokens correctly with zero values', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 0,
                outputTokens: 100,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const totalTokensMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'BedrockTotalTokens'
            );

            expect(totalTokensMetric.Value).toBe(100);
        });

        it('should calculate total tokens correctly with large values', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 10000,
                outputTokens: 20000,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const totalTokensMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'BedrockTotalTokens'
            );

            expect(totalTokensMetric.Value).toBe(30000);
        });

        it('should emit separate input and output token metrics with correct values', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitTokenUsage({
                inputTokens: 123,
                outputTokens: 456,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            const inputTokensMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'BedrockInputTokens'
            );
            const outputTokensMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'BedrockOutputTokens'
            );

            expect(inputTokensMetric.Value).toBe(123);
            expect(outputTokensMetric.Value).toBe(456);
        });

        it('should emit search score metrics with correct values', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 5,
                averageScore: 0.85,
                maxScore: 0.95,
                minScore: 0.75,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            const avgScoreMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'SearchAverageScore'
            );
            const maxScoreMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'SearchMaxScore'
            );
            const minScoreMetric = command.MetricData.find(
                (m: any) => m.MetricName === 'SearchMinScore'
            );

            expect(avgScoreMetric.Value).toBe(0.85);
            expect(maxScoreMetric.Value).toBe(0.95);
            expect(minScoreMetric.Value).toBe(0.75);

            // All score metrics should use None unit
            expect(avgScoreMetric.Unit).toBe('None');
            expect(maxScoreMetric.Unit).toBe('None');
            expect(minScoreMetric.Unit).toBe('None');
        });

        it('should not emit score metrics when not provided', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 5,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];

            // Should only emit the latency metric, not score metrics
            expect(command.MetricData).toHaveLength(1);
            expect(command.MetricData[0].MetricName).toBe('SearchLatency');
        });

        it('should handle decimal values correctly for latency metrics', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitQueryLatency({
                latency: 123.456,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            expect(metricDatum.Value).toBe(123.456);
            expect(typeof metricDatum.Value).toBe('number');
        });

        it('should handle zero values correctly', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitExecutionDuration({
                functionName: 'test-function',
                duration: 0,
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            expect(metricDatum.Value).toBe(0);
        });

        it('should convert dimension values to strings', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitSearchLatency({
                latency: 150,
                resultCount: 42, // Number that should be converted to string
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            const resultCountDimension = metricDatum.Dimensions.find(
                (d: any) => d.Name === 'ResultCount'
            );

            expect(resultCountDimension).toBeDefined();
            expect(resultCountDimension.Value).toBe('42');
            expect(typeof resultCountDimension.Value).toBe('string');
        });

        it('should handle embedding generation with multiple chunks', async () => {
            const emitter = new MetricsEmitter({ consoleLogging: false });

            await emitter.emitEmbeddingGenerationTime({
                generationTime: 5000,
                chunkCount: 100,
                documentId: 'doc-123',
            });

            await emitter.flush();

            const command = mockSend.mock.calls[0][0];
            const metricDatum = command.MetricData[0];

            expect(metricDatum.Value).toBe(5000);

            const chunkCountDimension = metricDatum.Dimensions.find(
                (d: any) => d.Name === 'ChunkCount'
            );
            expect(chunkCountDimension.Value).toBe('100');
        });
    });
});
