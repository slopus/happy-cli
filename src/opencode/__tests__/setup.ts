/**
 * OpenCode Test Setup
 *
 * Global test configuration and utilities for OpenCode tests
 */

import { vi, afterEach } from 'vitest';

// Mock logger globally
vi.mock('@/ui/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    infoDeveloper: vi.fn(),
  },
}));

// Increase timeout for integration/e2e tests
vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 });

// Global test cleanup
afterEach(() => {
  vi.clearAllMocks();
});
