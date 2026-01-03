/**
 * Options Parser Tests
 *
 * Tests for parsing and formatting XML options blocks from agent responses.
 */

import { describe, expect, it } from 'vitest';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from './optionsParser';

describe('parseOptionsFromText', () => {
  it('should parse options from valid XML', () => {
    const text = `Here are fixes:
<options>
  <option>Fix bug A</option>
  <option>Fix bug B</option>
</options>`;

    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Fix bug A', 'Fix bug B']);
    expect(result.text).toContain('Here are fixes:');
    expect(result.text).not.toContain('<options>');
  });

  it('should return empty options when no XML present', () => {
    const text = 'Plain text response without any options';
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual([]);
    expect(result.text).toBe('Plain text response without any options');
  });

  it('should handle incomplete options block', () => {
    const text = '<options><option>Test';
    const result = parseOptionsFromText(text);

    // Incomplete options are not parsed
    expect(result.options).toEqual([]);
  });

  it('should handle empty options block', () => {
    const text = 'Text before<options></options>Text after';
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual([]);
    expect(result.text).toBe('Text beforeText after');
  });

  it('should trim whitespace from options', () => {
    const text = '<options>  <option>  Fix it  </option>  </options>';
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Fix it']);
  });

  it('should handle single option', () => {
    const text = '<options><option>Only option</option></options>';
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Only option']);
  });

  it('should handle options with special characters', () => {
    const text = `<options>
  <option>Fix &amp; test</option>
  <option>Use "quotes"</option>
</options>`;
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Fix &amp; test', 'Use "quotes"']);
  });

  it('should handle multiline text with options at the end', () => {
    const text = `Here's my analysis of the code.

The issue is in the parsing logic.

<options>
  <option>Fix the parser</option>
  <option>Add tests</option>
</options>`;

    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Fix the parser', 'Add tests']);
    expect(result.text).toContain('Here\'s my analysis');
    expect(result.text).toContain('The issue is in the parsing logic');
    expect(result.text).not.toContain('<options>');
  });

  it('should handle case-insensitive XML tags', () => {
    const text = '<OPTIONS><option>Test</option></options>';
    const result = parseOptionsFromText(text);

    expect(result.options).toEqual(['Test']);
  });

  it('should handle malformed XML gracefully', () => {
    const text = '<options><option>Valid</option><option>Broken</options></options>';
    const result = parseOptionsFromText(text);

    // Only properly closed options are extracted
    expect(result.options).toEqual(['Valid']);
  });
});

describe('hasIncompleteOptions', () => {
  it('should return true for incomplete options block', () => {
    const text = 'Here are options: <options><option>One';
    expect(hasIncompleteOptions(text)).toBe(true);
  });

  it('should return false for complete options block', () => {
    const text = '<options><option>One</option></options>';
    expect(hasIncompleteOptions(text)).toBe(false);
  });

  it('should return false when no options block', () => {
    const text = 'Plain text without options';
    expect(hasIncompleteOptions(text)).toBe(false);
  });

  it('should return false for only closing tag', () => {
    const text = '</options>';
    expect(hasIncompleteOptions(text)).toBe(false);
  });
});

describe('formatOptionsXml', () => {
  it('should format options array as XML', () => {
    const xml = formatOptionsXml(['A', 'B', 'C']);

    expect(xml).toContain('<options>');
    expect(xml).toContain('<option>A</option>');
    expect(xml).toContain('<option>B</option>');
    expect(xml).toContain('<option>C</option>');
    expect(xml).toContain('</options>');
  });

  it('should return empty string for empty array', () => {
    expect(formatOptionsXml([])).toBe('');
  });

  it('should format single option', () => {
    const xml = formatOptionsXml(['Only option']);

    expect(xml).toBe('\n<options>\n    <option>Only option</option>\n</options>');
  });

  it('should preserve option text exactly', () => {
    const xml = formatOptionsXml(['Fix & test', 'Use "quotes"']);

    expect(xml).toContain('<option>Fix & test</option>');
    expect(xml).toContain('<option>Use "quotes"</option>');
  });

  it('should handle special characters', () => {
    const xml = formatOptionsXml(['Test <tag> content', 'Apostrophe\'s']);

    expect(xml).toContain('<option>Test <tag> content</option>');
    expect(xml).toContain('<option>Apostrophe\'s</option>');
  });
});
