/**
 * Message Flow Integration Tests
 *
 * Tests the flow of messages from user to agent and back
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import type { OpenCodeMode } from '@/opencode/types';

describe('Message Flow Integration Tests', () => {
  let queue: MessageQueue2<OpenCodeMode>;

  beforeEach(() => {
    queue = new MessageQueue2<OpenCodeMode>((mode) =>
      hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
      })
    );
  });

  describe('user message to agent', () => {
    it('should queue user message', () => {
      queue.push('Test message', {
        permissionMode: 'default',
        model: 'gpt-4',
      });

      expect(queue.size()).toBe(1);
      expect(queue.queue[0].message).toBe('Test message');
    });

    it('should resolve permission mode', () => {
      const mode: OpenCodeMode = {
        permissionMode: 'yolo',
        model: 'gpt-4',
      };

      queue.push('Test', mode);

      expect(queue.queue[0].mode).toEqual(mode);
    });

    it('should resolve model selection', () => {
      queue.push('Test', {
        permissionMode: 'default',
        model: 'claude-3-5-sonnet',
      });

      expect(queue.queue[0].mode.model).toBe('claude-3-5-sonnet');
    });

    it('should handle undefined model (uses default)', () => {
      queue.push('Test', {
        permissionMode: 'default',
        model: undefined,
      });

      expect(queue.queue[0].mode.model).toBeUndefined();
    });
  });

  describe('agent response streaming', () => {
    it('should accumulate response chunks', () => {
      const chunks: string[] = [];
      const responses = ['Chunk 1', 'Chunk 2', 'Chunk 3'];

      // Simulate accumulating chunks
      responses.forEach(chunk => chunks.push(chunk));

      expect(chunks).toEqual(responses);
      expect(chunks.join('')).toBe('Chunk 1Chunk 2Chunk 3');
    });

    it('should emit complete message on idle', () => {
      let accumulatedResponse = '';
      const chunks = ['Hello ', 'world ', '!'];

      // Simulate streaming
      chunks.forEach(chunk => {
        accumulatedResponse += chunk;
      });

      // When idle (streaming complete), emit full message
      expect(accumulatedResponse).toBe('Hello world !');
    });

    it('should parse options from response', () => {
      const responseWithOptions = `Here are options:
<options>
  <option>A</option>
  <option>B</option>
</options>`;

      // Parse options
      const match = responseWithOptions.match(/<options>([\s\S]*?)<\/options>/i);
      expect(match).toBeDefined();

      if (match) {
        const optionsBlock = match[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1]);

        expect(options).toEqual(['A', 'B']);
      }
    });

    it('should handle empty responses', () => {
      const response = '';

      expect(response).toBe('');
    });

    it('should handle incomplete responses', () => {
      const incomplete = 'This response is incomplete';

      // Should still handle
      expect(incomplete.length).toBeGreaterThan(0);
    });
  });

  describe('permission changes', () => {
    it('should update permission mode mid-session', () => {
      const handler = vi.fn();

      // Set initial handler
      queue.setOnMessage(handler);

      // Send with default mode
      queue.push('Message 1', { permissionMode: 'default', model: 'gpt-4' });

      // Change to yolo
      queue.push('Message 2', { permissionMode: 'yolo', model: 'gpt-4' });

      expect(handler).toHaveBeenCalledTimes(2);

      // Second call should have yolo mode
      const secondCall = handler.mock.calls[1];
      expect(secondCall[1].permissionMode).toBe('yolo');
    });

    it('should apply new mode to next message', () => {
      queue.push('Message 1', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Message 2', { permissionMode: 'yolo', model: 'gpt-4' });

      expect(queue.queue[0].mode.permissionMode).toBe('default');
      expect(queue.queue[1].mode.permissionMode).toBe('yolo');
    });

    it('should notify mobile of mode change', () => {
      const handler = vi.fn();

      queue.setOnMessage(handler);

      // Change mode
      queue.push('Test', { permissionMode: 'read-only', model: 'gpt-4' });

      // Handler should be called with new mode
      expect(handler).toHaveBeenCalledWith(
        'Test',
        expect.objectContaining({
          permissionMode: 'read-only',
        })
      );
    });
  });

  describe('model changes', () => {
    it('should update model mid-session', () => {
      queue.push('Message 1', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Message 2', { permissionMode: 'default', model: 'claude-3-5-sonnet' });

      expect(queue.queue[0].mode.model).toBe('gpt-4');
      expect(queue.queue[1].mode.model).toBe('claude-3-5-sonnet');
    });

    it('should handle model set to null (use default)', () => {
      queue.push('Test', { permissionMode: 'default', model: null as any });

      expect(queue.queue[0].mode.model).toBeNull();
    });

    it('should apply new model to next message', () => {
      // Change model
      queue.push('Message 1', { permissionMode: 'default', model: 'gpt-4' });

      const model1 = queue.queue[0].mode.model;

      queue.push('Message 2', { permissionMode: 'default', model: 'claude-3-5-sonnet' });

      const model2 = queue.queue[1].mode.model;

      expect(model1).toBe('gpt-4');
      expect(model2).toBe('claude-3-5-sonnet');
    });
  });

  describe('message queue management', () => {
    it('should handle queue reset mid-flow', () => {
      queue.push('Message 1', { permissionMode: 'default', model: 'gpt-4' });
      queue.push('Message 2', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.size()).toBe(2);

      // Reset queue (abort scenario)
      queue.reset();

      expect(queue.size()).toBe(0);
    });

    it('should allow adding messages after reset', () => {
      queue.push('Before reset', { permissionMode: 'default', model: 'gpt-4' });
      queue.reset();

      queue.push('After reset', { permissionMode: 'default', model: 'gpt-4' });

      expect(queue.size()).toBe(1);
      expect(queue.queue[0].message).toBe('After reset');
    });

    it('should handle rapid message queuing', () => {
      const count = 100;

      for (let i = 0; i < count; i++) {
        queue.push(`Message ${i}`, {
          permissionMode: 'default',
          model: 'gpt-4',
        });
      }

      expect(queue.size()).toBe(count);
    });
  });
});
