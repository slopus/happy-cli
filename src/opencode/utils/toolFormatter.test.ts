import { describe, it, expect } from 'vitest';
import { formatToolResult } from './toolFormatter';

describe('toolFormatter', () => {
    describe('formatToolResult', () => {
        it('should format ls result array', () => {
            const result = ['file1.ts', 'file2.ts'];
            const formatted = formatToolResult('ls', result);
            expect(formatted).toContain('- file1.ts');
            expect(formatted).toContain('- file2.ts');
        });

        it('should truncate large ls list', () => {
            const result = Array.from({ length: 60 }, (_, i) => `file${i}`);
            const formatted = formatToolResult('ls', result);
            expect(formatted).toContain('... and 10 more items');
        });

        it('should format read result', () => {
            const result = 'const x = 1;';
            const formatted = formatToolResult('read', result);
            expect(formatted).toContain('```');
            expect(formatted).toContain('const x = 1;');
        });

        it('should format grep matches', () => {
            const result = [
                { file: 'a.ts', line: 10, text: 'match1' },
                { file: 'b.ts', line: 20, text: 'match2' }
            ];
            const formatted = formatToolResult('grep', result);
            expect(formatted).toContain('a.ts:10: match1');
            expect(formatted).toContain('b.ts:20: match2');
        });

        it('should format success', () => {
            const formatted = formatToolResult('write', '');
            expect(formatted).toContain('✅ write completed successfully');
        });

        it('should fallback to json for unknown tool', () => {
            const result = { foo: 'bar' };
            const formatted = formatToolResult('unknown', result);
            expect(formatted).toContain('json');
            expect(formatted).toContain('"foo": "bar"');
        });
    });
});
