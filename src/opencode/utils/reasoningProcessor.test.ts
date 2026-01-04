import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeReasoningProcessor, ReasoningOutput } from './reasoningProcessor';

describe('OpenCodeReasoningProcessor', () => {
  let processor: OpenCodeReasoningProcessor;
  let messages: ReasoningOutput[];
  let onMessage: (msg: ReasoningOutput) => void;

  beforeEach(() => {
    messages = [];
    onMessage = (msg) => messages.push(msg);
    processor = new OpenCodeReasoningProcessor(onMessage);
  });

  describe('title detection', () => {
    it('should detect title pattern **Title** and emit tool call', () => {
      processor.processChunk('**Analyzing the code**');
      processor.processChunk('\nLet me look at this...');
      processor.complete();

      expect(messages.length).toBe(2);
      
      // First message: tool call start
      expect(messages[0].type).toBe('tool-call');
      if (messages[0].type === 'tool-call') {
        expect(messages[0].name).toBe('CodexReasoning');
        expect(messages[0].input.title).toBe('Analyzing the code');
      }

      // Second message: tool call result
      expect(messages[1].type).toBe('tool-call-result');
      if (messages[1].type === 'tool-call-result') {
        expect(messages[1].output.status).toBe('completed');
        expect(messages[1].output.content).toContain('Let me look at this');
      }
    });

    it('should handle title split across chunks', () => {
      processor.processChunk('**Ana');
      processor.processChunk('lyzing**');
      processor.processChunk(' content here');
      processor.complete();

      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('tool-call');
      if (messages[0].type === 'tool-call') {
        expect(messages[0].input.title).toBe('Analyzing');
      }
    });

    it('should emit tool call immediately when closing ** is detected', () => {
      // Title is only detected when both opening and closing ** are found
      processor.processChunk('**My Title');
      expect(messages.length).toBe(0); // Not emitted yet - title not closed
      
      processor.processChunk('**');
      // Tool call should be emitted when title is complete
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool-call');
    });
  });

  describe('untitled reasoning', () => {
    it('should emit reasoning message for untitled content', () => {
      processor.processChunk('Just some thinking without a title...');
      processor.complete();

      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('reasoning');
      if (messages[0].type === 'reasoning') {
        expect(messages[0].message).toContain('Just some thinking');
      }
    });

    it('should not emit message for empty content', () => {
      processor.processChunk('');
      processor.processChunk('   ');
      const completed = processor.complete();

      expect(completed).toBe(false);
      expect(messages.length).toBe(0);
    });
  });

  describe('abort behavior', () => {
    it('should send canceled result when aborting titled reasoning', () => {
      processor.processChunk('**Title**');
      processor.processChunk(' some content');
      processor.abort();

      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('tool-call-result');
      if (messages[1].type === 'tool-call-result') {
        expect(messages[1].output.status).toBe('canceled');
      }
    });

    it('should not emit anything when aborting empty state', () => {
      processor.abort();
      expect(messages.length).toBe(0);
    });

    it('should reset state after abort', () => {
      processor.processChunk('**Title**');
      processor.abort();
      
      // Clear messages
      messages = [];
      
      // Start fresh
      processor.processChunk('**New Title**');
      processor.complete();

      expect(messages.length).toBe(2);
      if (messages[0].type === 'tool-call') {
        expect(messages[0].input.title).toBe('New Title');
      }
    });
  });

  describe('section break handling', () => {
    it('should finish current tool call on section break', () => {
      processor.processChunk('**First Section**');
      processor.processChunk(' content');
      processor.handleSectionBreak();

      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('tool-call-result');
      if (messages[1].type === 'tool-call-result') {
        expect(messages[1].output.status).toBe('canceled');
      }
    });

    it('should allow new section after break', () => {
      processor.processChunk('**First**');
      processor.handleSectionBreak();
      
      messages = [];
      
      processor.processChunk('**Second**');
      processor.complete();

      expect(messages.length).toBe(2);
      if (messages[0].type === 'tool-call') {
        expect(messages[0].input.title).toBe('Second');
      }
    });
  });

  describe('helper methods', () => {
    it('should return correct call ID', () => {
      expect(processor.getCurrentCallId()).toBeNull();
      
      // Need to close the title to get a call ID
      processor.processChunk('**Title');
      processor.processChunk('**');
      const callId = processor.getCurrentCallId();
      expect(callId).not.toBeNull();
      expect(typeof callId).toBe('string');
    });

    it('should track tool call started state', () => {
      expect(processor.hasStartedToolCall()).toBe(false);
      
      // Need to close the title to start the tool call
      processor.processChunk('**Title');
      processor.processChunk('**');
      expect(processor.hasStartedToolCall()).toBe(true);
    });

    it('should allow setting message callback', () => {
      const newMessages: ReasoningOutput[] = [];
      processor.setMessageCallback((msg) => newMessages.push(msg));
      
      processor.processChunk('**Test**');
      processor.complete();

      expect(newMessages.length).toBe(2);
      expect(messages.length).toBe(0); // Old callback should not receive
    });
  });

  describe('reset behavior', () => {
    it('should finish tool call and reset state', () => {
      processor.processChunk('**Title**');
      processor.processChunk(' content');
      processor.reset();

      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('tool-call-result');

      // Verify reset
      expect(processor.getCurrentCallId()).toBeNull();
      expect(processor.hasStartedToolCall()).toBe(false);
    });
  });

  describe('mobile app compatibility', () => {
    it('should use CodexReasoning as tool name for mobile app', () => {
      processor.processChunk('**Test');
      processor.processChunk('**');
      
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool-call');
      if (messages[0].type === 'tool-call') {
        expect(messages[0].name).toBe('CodexReasoning');
      }
    });

    it('should include proper message structure', () => {
      processor.processChunk('**Title**');
      processor.complete();

      // Verify tool call structure
      const toolCall = messages[0];
      expect(toolCall.type).toBe('tool-call');
      if (toolCall.type === 'tool-call') {
        expect(toolCall).toHaveProperty('callId');
        expect(toolCall).toHaveProperty('id');
        expect(toolCall).toHaveProperty('input');
        expect(toolCall.input).toHaveProperty('title');
      }

      // Verify tool result structure
      const toolResult = messages[1];
      expect(toolResult.type).toBe('tool-call-result');
      if (toolResult.type === 'tool-call-result') {
        expect(toolResult).toHaveProperty('callId');
        expect(toolResult).toHaveProperty('id');
        expect(toolResult).toHaveProperty('output');
        expect(toolResult.output).toHaveProperty('status');
      }
    });
  });
});
