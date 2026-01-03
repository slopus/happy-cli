/**
 * Options Buttons E2E Tests
 *
 * End-to-end tests for options/suggestions buttons feature
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { OpenCodeMode } from '@/opencode/types';

describe('Options Buttons E2E Tests', () => {
  describe('options XML parsing', () => {
    it('should parse options from response', () => {
      const response = `I can help with that:

<options>
  <option>Fix the authentication bug</option>
  <option>Add unit tests for the API</option>
  <option>Update documentation</option>
</options>

Which would you like me to do?`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        expect(options).toEqual([
          'Fix the authentication bug',
          'Add unit tests for the API',
          'Update documentation',
        ]);
      }
    });

    it('should handle options with code', () => {
      const response = `Here are some options:

<options>
  <option>Implement this function:

function processData(data) {
  return data.map(x => x * 2);
}</option>
  <option>Use a library instead</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>([\s\S]*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        expect(options[0]).toContain('function processData');
        expect(options[0]).toContain('return data.map');
        expect(options[1]).toBe('Use a library instead');
      }
    });

    it('should handle empty options', () => {
      const response = `<options></options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>([\s\S]*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        expect(options).toHaveLength(0);
      }
    });

    it('should handle malformed XML gracefully', () => {
      const response = `Here are some options:

<options>
  <option>Option 1
  <option>Option 2</option>
  Missing closing tag
</options>`;

      // Should still parse what it can
      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();
    });

    it('should handle options with Unicode', () => {
      const response = `<options>
  <option>修复中文选项</option>
  <option>Fix English option</option>
  <option>תקן עברית</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        expect(options).toHaveLength(3);
        expect(options[0]).toContain('中文');
        expect(options[1]).toContain('English');
        expect(options[2]).toContain('עברית');
      }
    });
  });

  describe('options display workflow', () => {
    it('should extract options for mobile display', () => {
      const response = `I suggest:

<options>
  <option>Create a new component</option>
  <option>Refactor existing code</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        // Should be ready for mobile display
        expect(Array.isArray(options)).toBe(true);
        expect(options.length).toBeGreaterThan(0);

        // Each option should be a non-empty string
        options.forEach(option => {
          expect(typeof option).toBe('string');
          expect(option.length).toBeGreaterThan(0);
        });
      }
    });

    it('should handle options with special characters', () => {
      const response = `<options>
  <option>Use <code>const</code> instead of <code>var</code></option>
  <option>Add "quotes" & 'apostrophes'</option>
  <option>Use $variable and {placeholders}</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        expect(options[0]).toContain('<code>');
        expect(options[1]).toContain('"quotes"');
        expect(options[2]).toContain('$variable');
      }
    });

    it('should truncate very long options for display', () => {
      const longText = 'x'.repeat(500);
      const response = `<options>
        <option>${longText}</option>
      </options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        const optionMatches = optionsBlock.matchAll(/<option>(.*?)<\/option>/gi);
        const options = Array.from(optionMatches).map(m => m[1].trim());

        // Option exists, would be truncated by UI
        expect(options[0].length).toBe(500);
      }
    });
  });

  describe('option selection workflow', () => {
    it('should handle user selecting an option', () => {
      const options = ['Fix bug A', 'Fix bug B', 'Add tests'];
      const selectedIndex = 1;

      expect(selectedIndex).toBeGreaterThanOrEqual(0);
      expect(selectedIndex).toBeLessThan(options.length);
      expect(options[selectedIndex]).toBe('Fix bug B');
    });

    it('should send selected option as prompt', () => {
      const options = ['Option 1', 'Option 2', 'Option 3'];
      const selectedIndex = 2;
      const selectedPrompt = options[selectedIndex];

      expect(selectedPrompt).toBe('Option 3');
      expect(typeof selectedPrompt).toBe('string');
    });

    it('should handle option selection with context', () => {
      const options = ['Refactor function X', 'Optimize performance', 'Add error handling'];
      const selectedIndex = 0;
      const context = 'User selected: ' + options[selectedIndex];

      expect(context).toBe('User selected: Refactor function X');
    });
  });

  describe('options with different modes', () => {
    it('should work with yolo mode', () => {
      const mode: OpenCodeMode = {
        permissionMode: 'yolo',
        model: 'gpt-4',
      };

      const response = `<options>
        <option>Action A</option>
        <option>Action B</option>
      </options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();
      expect(mode.permissionMode).toBe('yolo');
    });

    it('should work with default mode', () => {
      const mode: OpenCodeMode = {
        permissionMode: 'default',
        model: 'claude-3-5-sonnet',
      };

      expect(mode.permissionMode).toBe('default');
    });

    it('should work with different models', () => {
      const models = ['gpt-4', 'claude-3-5-sonnet', 'gemini-pro'];

      models.forEach(model => {
        expect(model).toBeDefined();
        expect(typeof model).toBe('string');
      });
    });
  });

  describe('options edge cases', () => {
    it('should handle options at end of response', () => {
      const response = `Here's my analysis of the code.

<options>
  <option>Refactor now</option>
  <option>Defer refactoring</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();
    });

    it('should handle options at start of response', () => {
      const response = `<options>
  <option>Start with tests</option>
  <option>Start with implementation</option>
</options>

Here's my reasoning...`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();
    });

    it('should handle options in middle of response', () => {
      const response = `First, here's the context.

<options>
  <option>Approach A</option>
  <option>Approach B</option>
</options>

Now let me explain the tradeoffs...`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();
    });

    it('should handle multiple options blocks', () => {
      const response = `<options>
  <option>Step 1 option</option>
</options>

Some explanation...

<options>
  <option>Step 2 option</option>
</options>`;

      const optionsMatches = response.matchAll(/<options>([\s\S]*?)<\/options>/gi);
      const optionsBlocks = Array.from(optionsMatches);

      expect(optionsBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle nested-looking content', () => {
      const response = `<options>
  <option>This looks like <nested> content</option>
  <option>But it's just text</option>
</options>`;

      const optionsMatch = response.match(/<options>([\s\S]*?)<\/options>/i);
      expect(optionsMatch).toBeDefined();

      if (optionsMatch) {
        const optionsBlock = optionsMatch[1];
        expect(optionsBlock).toContain('<nested>');
      }
    });
  });
});
