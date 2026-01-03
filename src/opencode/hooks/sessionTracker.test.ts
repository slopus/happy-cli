/**
 * Unit tests for SessionTracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionTracker, createSessionTracker } from './sessionTracker';

describe('SessionTracker', () => {
  let onSessionId: ReturnType<typeof vi.fn>;
  let tracker: SessionTracker;

  beforeEach(() => {
    onSessionId = vi.fn();
    tracker = new SessionTracker({ onSessionId });
  });

  describe('captureSessionId', () => {
    it('should capture and emit first session ID', () => {
      tracker.captureSessionId('abc-123');

      expect(tracker.getSessionId()).toBe('abc-123');
      expect(onSessionId).toHaveBeenCalledWith('abc-123');
      expect(onSessionId).toHaveBeenCalledTimes(1);
    });

    it('should emit when session ID changes', () => {
      tracker.captureSessionId('abc-123');
      tracker.captureSessionId('def-456');

      expect(tracker.getSessionId()).toBe('def-456');
      expect(onSessionId).toHaveBeenCalledWith('abc-123');
      expect(onSessionId).toHaveBeenCalledWith('def-456');
      expect(onSessionId).toHaveBeenCalledTimes(2);
    });

    it('should not emit when session ID is the same', () => {
      tracker.captureSessionId('abc-123');
      tracker.captureSessionId('abc-123');

      expect(tracker.getSessionId()).toBe('abc-123');
      expect(onSessionId).toHaveBeenCalledWith('abc-123');
      expect(onSessionId).toHaveBeenCalledTimes(1);
    });

    it('should handle session ID changing to undefined', () => {
      tracker.captureSessionId('abc-123');
      tracker.captureSessionId('');

      expect(tracker.getSessionId()).toBe('');
      expect(onSessionId).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSessionId', () => {
    it('should return undefined when no session captured', () => {
      expect(tracker.getSessionId()).toBeUndefined();
    });

    it('should return current session ID', () => {
      tracker.captureSessionId('xyz-789');
      expect(tracker.getSessionId()).toBe('xyz-789');
    });
  });

  describe('hasSessionId', () => {
    it('should return false when no session captured', () => {
      expect(tracker.hasSessionId()).toBe(false);
    });

    it('should return true when session captured', () => {
      tracker.captureSessionId('session-1');
      expect(tracker.hasSessionId()).toBe(true);
    });
  });
});

describe('createSessionTracker', () => {
  it('should create a SessionTracker instance', () => {
    const onSessionId = vi.fn();
    const tracker = createSessionTracker({ onSessionId });

    expect(tracker).toBeInstanceOf(SessionTracker);
    tracker.captureSessionId('test-123');
    expect(onSessionId).toHaveBeenCalledWith('test-123');
  });
});
