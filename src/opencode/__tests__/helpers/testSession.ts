/**
 * Test Session Helper
 *
 * Creates isolated test sessions with automatic cleanup
 */

import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { TestSession, TestResponse } from './types';
import type { PermissionMode } from '@/opencode/types';

export async function createTestSession(opts?: {
  credentials?: {
    apiKey: string;
    apiUrl: string;
  };
  model?: string;
  permissionMode?: PermissionMode;
}): Promise<TestSession> {
  const sessionId = randomUUID();
  const permissionMode = opts?.permissionMode ?? 'default';
  const model = opts?.model;

  let status: 'idle' | 'busy' | 'disconnected' | 'error' = 'idle';
  const responses: TestResponse[] = [];

  return {
    sessionId,

    async sendPrompt(prompt: string): Promise<TestResponse> {
      status = 'busy';

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 10));

      status = 'idle';

      return {
        content: `Response to: ${prompt}`,
        options: [],
        complete: true,
      };
    },

    setPermissionMode(mode: PermissionMode): void {
      // Store mode for verification
    },

    setModel(newModel: string | undefined): void {
      // Store model for verification
    },

    async close(): Promise<void> {
      status = 'disconnected';
    },

    getStatus() {
      return status;
    },
  };
}

/**
 * Run a callback with a temporary session that auto-cleans up
 */
export async function withTemporarySession(
  fn: (session: TestSession) => Promise<void>
): Promise<void> {
  const session = await createTestSession();

  try {
    await fn(session);
  } finally {
    await session.close();
  }
}
