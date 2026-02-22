const MAX_OPTIONS = 4;

/**
 * Parse <options><option>...</option></options> XML from Claude's response text.
 * Returns up to 4 option strings (iOS notification action limit).
 */
export function parseOptions(text: string): string[] {
    const optionsMatch = text.match(/<options>([\s\S]*?)<\/options>/);
    if (!optionsMatch) return [];

    const optionMatches = optionsMatch[1].matchAll(/<option>([\s\S]*?)<\/option>/g);
    const options: string[] = [];
    for (const match of optionMatches) {
        const trimmed = match[1].trim();
        if (trimmed.length > 0) {
            options.push(trimmed);
        }
        if (options.length >= MAX_OPTIONS) break;
    }
    return options;
}
