import { describe, it, expect } from 'vitest';

describe('doctor redaction', () => {
    it('does not treat ${VAR:-default} templates as safe', async () => {
        const doctorModule = (await import('@/ui/doctor')) as typeof import('@/ui/doctor');
        expect(doctorModule.maskValue('${SAFE_TEMPLATE}')).toBe('${SAFE_TEMPLATE}');
        expect(doctorModule.maskValue('${LEAK:-sk-live-secret}')).not.toBe('${LEAK:-sk-live-secret}');
    });
});
