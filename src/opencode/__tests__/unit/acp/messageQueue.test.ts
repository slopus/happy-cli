/**
 * Message Queue Unit Tests
 *
 * Tests for the message queue that manages user prompts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import type { OpenCodeMode } from '@/opencode/types';

describe('Message Queue Unit Tests', () => {
  let queue: MessageQueue2<OpenCodeMode>;

  beforeEach(() => {
    queue = new MessageQueue2<OpenCodeMode>((mode) =>
      hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
      })
    );
  });

  describe('queue operations', () => {
    it('should enqueue messages', () => {
      queue.push('First message', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.size()).toBe(1);
    });

    it('should access public queue array', () => {
      queue.push('First', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Second', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Third', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.queue.length).toBe(3);
      expect(queue.queue[0].message).toBe('First');
      expect(queue.queue[1].message).toBe('Second');
      expect(queue.queue[2].message).toBe('Third');
    });

    it('should handle queue overflow gracefully', () => {
      // Add many messages
      for (let i = 0; i < 1000; i++) {
        queue.push(`Message ${i}`, { permissionMode: 'default', model: 'gpt-4' });
      }

      // Should still work
      expect(queue.size()).toBe(1000);
    });

    it('should add to front with unshift', () => {
      queue.push('First', { permissionMode: 'default', model: 'gpt-4' });
      queue.unshift('Priority', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.queue.length).toBe(2);
      expect(queue.queue[0].message).toBe('Priority');
      expect(queue.queue[1].message).toBe('First');
    });
  });

  describe('mode hashing', () => {
    it('should generate consistent hash for same mode', () => {
      const mode = { permissionMode: 'default' as const, model: 'gpt-4' };
      const hash1 = hashObject(mode);
      const hash2 = hashObject(mode);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different mode', () => {
      const mode1 = { permissionMode: 'default' as const, model: 'gpt-4' };
      const mode2 = { permissionMode: 'yolo' as const, model: 'gpt-4' };

      const hash1 = hashObject(mode1);
      const hash2 = hashObject(mode2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle null/undefined model', () => {
      const mode1 = { permissionMode: 'default' as const, model: undefined };
      const mode2 = { permissionMode: 'default' as const, model: null as any };

      const hash1 = hashObject(mode1);
      const hash2 = hashObject(mode2);

      // Should handle gracefully
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all queued messages', () => {
      queue.push('First', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Second', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Third', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.size()).toBe(3);

      queue.reset();

      expect(queue.size()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      queue.push('Test', { permissionMode: 'default', model: 'gpt-4' });

      queue.reset();
      queue.reset();
      queue.reset();

      // Should not throw
      expect(queue.size()).toBe(0);
    });

    it('should allow adding messages after reset', () => {
      queue.push('First', { permissionMode: 'default', model: 'gpt-4' });
      queue.reset();

      queue.push('After reset', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.size()).toBe(1);
      expect(queue.queue[0].message).toBe('After reset');
    });
  });

  describe('onMessage handler', () => {
    it('should call handler when message is pushed', () => {
      const handler = vi.fn();
      queue.setOnMessage(handler);

      queue.push('Test message', { permissionMode: 'default', model: 'gpt-4' });

      expect(handler).toHaveBeenCalledWith('Test message', {
        permissionMode: 'default',
        model: 'gpt-4',
      });
    });

    it('should not call handler when set to null', () => {
      const handler = vi.fn();
      queue.setOnMessage(handler);
      queue.setOnMessage(null);

      queue.push('Test message', { permissionMode: 'default', model: 'gpt-4' });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
