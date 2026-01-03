/**
 * Test Helper Types
 *
 * Common types used across OpenCode tests
 */

import type { Credentials } from '@/persistence';
import type { PermissionMode } from '@/opencode/types';

export interface TestSession {
  sessionId: string;
  sendPrompt(prompt: string): Promise<TestResponse>;
  setPermissionMode(mode: PermissionMode): void;
  setModel(model: string | undefined): void;
  close(): Promise<void>;
  getStatus(): TestSessionStatus;
}

export type TestSessionStatus = 'idle' | 'busy' | 'disconnected' | 'error';

export interface TestResponse {
  content: string;
  options: string[];
  complete: boolean;
  partial?: boolean;
  error?: string;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface PerformanceMetrics {
  promptSize: number;
  responseTime: number;
  chunkCount: number;
  avgChunkDelay: number;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  memoryPeak: number;
}

export interface PerformanceThresholds {
  maxResponseTime: number; // ms
  maxAvgChunkDelay: number; // ms
  maxMemoryGrowth: number; // bytes
}

export interface MockACPOptions {
  port?: number;
  autoRespond?: boolean;
  latency?: number; // Simulated latency in ms
}

export interface ACPMessage {
  type: string;
  data?: unknown;
}
