/**
 * OpenCode Test Utilities
 *
 * Central export point for all test helpers, fixtures, and utilities
 */

// Helpers
export { createTestSession, withTemporarySession } from './helpers/testSession';
export { MockACPServer, createMockACP } from './helpers/mockACP';
export { MemoryMonitor, createMemoryMonitor } from './helpers/memoryMonitor';
export type {
  TestSession,
  TestResponse,
  TestSessionStatus,
  MemorySnapshot,
  PerformanceMetrics,
  PerformanceThresholds,
  MockACPOptions,
  ACPMessage,
} from './helpers/types';

// Fixtures
export {
  FIXTURE_PROMPTS,
  TOOL_USE_PROMPTS,
  EDGE_CASE_PROMPTS,
  generateLargePrompt,
  generateSpecialCharPrompt,
  generateOptionsPrompt,
} from './fixtures/prompts';
export {
  FIXTURE_RESPONSES,
  ACP_MESSAGES,
  ERROR_SCENARIOS,
  generateStreamingResponse,
  generateOptionsResponse,
} from './fixtures/responses';

// Benchmarks
export {
  measurePerformance,
  assertPerformance,
  assertCompletesWithin,
  measureRepeatedPerformance,
} from './benchmarks/metrics';
