import { describe, expect, it } from 'vitest';
import { parseOptions } from './parseOptions';

describe('parseOptions', () => {
    it('should extract options from XML tags', () => {
        const text = `Here is my answer.\n\n<options>\n<option>Option A</option>\n<option>Option B</option>\n<option>Option C</option>\n</options>`;
        expect(parseOptions(text)).toEqual(['Option A', 'Option B', 'Option C']);
    });

    it('should return empty array when no options', () => {
        expect(parseOptions('Just a normal message')).toEqual([]);
    });

    it('should limit to 4 options (iOS constraint)', () => {
        const text = `<options>\n<option>A</option>\n<option>B</option>\n<option>C</option>\n<option>D</option>\n<option>E</option>\n</options>`;
        expect(parseOptions(text)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should handle whitespace and newlines in options', () => {
        const text = `<options>\n    <option>  Trimmed  </option>\n</options>`;
        expect(parseOptions(text)).toEqual(['Trimmed']);
    });
});
