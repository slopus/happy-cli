/**
 * Session Tracker for OpenCode
 *
 * Captures and tracks OpenCode session IDs from ACP newSession responses.
 * Note: OpenCode ACP doesn't have Claude-style hooks, so we only capture
 * the initial session ID when the session is created.
 */

import { logger } from '@/ui/logger';

export interface SessionTrackerOptions {
  /** Called when a new session ID is captured */
  onSessionId: (sessionId: string) => void;
}

export class SessionTracker {
  private sessionId?: string;
  private options: SessionTrackerOptions;

  constructor(options: SessionTrackerOptions) {
    this.options = options;
  }

  /**
   * Capture and emit session ID if it has changed
   * @param sessionId - The session ID from ACP newSession response
   */
  captureSessionId(sessionId: string): void {
    // Only emit if session ID changed
    if (this.sessionId !== sessionId) {
      const previousId = this.sessionId;
      this.sessionId = sessionId;

      logger.debug(`[opencode] Session ID captured: ${previousId || '(none)'} → ${sessionId}`);
      this.options.onSessionId(sessionId);
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Check if a session ID is currently being tracked
   */
  hasSessionId(): boolean {
    return this.sessionId !== undefined;
  }
}

/**
 * Create a SessionTracker instance
 */
export function createSessionTracker(options: SessionTrackerOptions): SessionTracker {
  return new SessionTracker(options);
}
