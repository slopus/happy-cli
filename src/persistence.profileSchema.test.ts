import { describe, expect, it } from 'vitest';
import { AIBackendProfileSchema } from './persistence';

describe('AIBackendProfileSchema legacy provider config migration', () => {
    it('migrates legacy provider config objects into environmentVariables', () => {
        const profile = AIBackendProfileSchema.parse({
            id: 'profile-1',
            name: 'Profile 1',
            openaiConfig: {
                apiKey: '${OPENAI_KEY}',
            },
        });

        expect(profile.environmentVariables).toContainEqual({ name: 'OPENAI_API_KEY', value: '${OPENAI_KEY}' });
        expect((profile as any).openaiConfig).toBeUndefined();
    });

    it('does not override explicit environmentVariables with legacy config values', () => {
        const profile = AIBackendProfileSchema.parse({
            id: 'profile-1',
            name: 'Profile 1',
            environmentVariables: [{ name: 'OPENAI_API_KEY', value: 'explicit' }],
            openaiConfig: {
                apiKey: 'legacy',
            },
        });

        const apiKeyEntries = profile.environmentVariables.filter((ev) => ev.name === 'OPENAI_API_KEY');
        expect(apiKeyEntries).toHaveLength(1);
        expect(apiKeyEntries[0]?.value).toBe('explicit');
    });
});
