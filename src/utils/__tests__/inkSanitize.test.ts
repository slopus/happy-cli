import { describe, expect, it } from 'vitest';

import { sanitizeInkText, truncateInkText } from '../inkSanitize';

describe('sanitizeInkText', () => {
    it('strips ANSI/control/bidi/zero-width and normalizes whitespace', () => {
        const raw = [
            'Hello',
            '\u001b[31mRED\u001b[0m',
            '\u202Eevil\u202C',
            '\u200B',
            '\u0000',
            '\t',
            'world',
        ].join(' ');

        expect(sanitizeInkText(raw)).toBe('Hello RED evil world');
    });
});

describe('truncateInkText', () => {
    it('truncates long strings with ellipsis', () => {
        expect(truncateInkText('1234567890', 5)).toBe('12...');
    });

    it('handles very small max values', () => {
        expect(truncateInkText('abcdef', 2)).toBe('ab');
    });
});
