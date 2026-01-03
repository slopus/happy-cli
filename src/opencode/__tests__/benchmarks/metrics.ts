/**
 * Performance Measurement Utilities
 *
 * Measure and assert performance during test execution
 */

import type { PerformanceMetrics, PerformanceThresholds } from '../helpers/types';

/**
 * Measure performance during function execution
 */
export async function measurePerformance(
  fn: (prompt: string) => Promise<unknown>,
  prompt: string
): Promise<PerformanceMetrics> {
  const memoryBefore = {
    timestamp: Date.now(),
    heapUsed: process.memoryUsage().heapUsed,
    heapTotal: process.memoryUsage().heapTotal,
    external: process.memoryUsage().external,
  };

  const startTime = Date.now();
  const chunkTimestamps: number[] = [];

  // Execute function (simplified - doesn't capture actual chunks)
  await fn(prompt);

  const endTime = Date.now();

  const memoryAfter = {
    timestamp: Date.now(),
    heapUsed: process.memoryUsage().heapUsed,
    heapTotal: process.memoryUsage().heapTotal,
    external: process.memoryUsage().external,
  };

  const responseTime = endTime - startTime;

  return {
    promptSize: prompt.length,
    responseTime,
    chunkCount: chunkTimestamps.length,
    avgChunkDelay:
      chunkTimestamps.length > 0
        ? responseTime / chunkTimestamps.length
        : 0,
    memoryBefore,
    memoryAfter,
    memoryPeak: Math.max(memoryBefore.heapUsed, memoryAfter.heapUsed),
  };
}

/**
 * Assert that performance meets thresholds
 */
export function assertPerformance(
  metrics: PerformanceMetrics,
  thresholds: PerformanceThresholds
): void {
  const {
    maxResponseTime,
    maxAvgChunkDelay,
    maxMemoryGrowth,
  } = thresholds;

  // Check response time
  if (metrics.responseTime > maxResponseTime) {
    throw new Error(
      `Response time ${metrics.responseTime}ms exceeds threshold ${maxResponseTime}ms`
    );
  }

  // Check average chunk delay
  if (metrics.avgChunkDelay > maxAvgChunkDelay) {
    throw new Error(
      `Avg chunk delay ${metrics.avgChunkDelay}ms exceeds threshold ${maxAvgChunkDelay}ms`
    );
  }

  // Check memory growth
  const memoryGrowth = metrics.memoryAfter.heapUsed - metrics.memoryBefore.heapUsed;
  if (memoryGrowth > maxMemoryGrowth) {
    throw new Error(
      `Memory growth ${memoryGrowth} bytes exceeds threshold ${maxMemoryGrowth} bytes`
    );
  }
}

/**
 * Run a function and assert it completes within time limit
 */
export async function assertCompletesWithin(
  fn: () => Promise<unknown>,
  maxMs: number,
  description?: string
): Promise<void> {
  const startTime = Date.now();
  await fn();
  const duration = Date.now() - startTime;

  if (duration > maxMs) {
    throw new Error(
      `${description ?? 'Operation'} took ${duration}ms, exceeding limit of ${maxMs}ms`
    );
  }
}

/**
 * Measure multiple runs and return statistics
 */
export async function measureRepeatedPerformance(
  fn: () => Promise<unknown>,
  runs: number
): Promise<{
  avg: number;
  min: number;
  max: number;
  median: number;
}> {
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const startTime = Date.now();
    await fn();
    durations.push(Date.now() - startTime);
  }

  durations.sort((a, b) => a - b);

  return {
    avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
    min: durations[0],
    max: durations[durations.length - 1],
    median: durations[Math.floor(durations.length / 2)],
  };
}
