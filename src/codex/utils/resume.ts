export function extractResumeSessionId(resumeArgs?: string[]): string | null {
    if (!resumeArgs || resumeArgs.length === 0) return null;
    const resumeIndex = resumeArgs.indexOf('--resume') !== -1
        ? resumeArgs.indexOf('--resume')
        : resumeArgs.indexOf('resume');
    if (resumeIndex === -1) return null;
    const candidate = resumeArgs[resumeIndex + 1];
    if (!candidate || candidate.startsWith('-')) return null;
    const uuidMatch = candidate.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
        return uuidMatch[0];
    }
    return null;
}
