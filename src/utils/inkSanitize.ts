const ANSI_ESCAPE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const CONTROL_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;
const BIDI_REGEX = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;

export function sanitizeInkText(input: string | undefined): string {
    if (!input) return '';
    const stripped = input
        .replace(ANSI_ESCAPE_REGEX, '')
        .replace(CONTROL_REGEX, '')
        .replace(BIDI_REGEX, '')
        .replace(ZERO_WIDTH_REGEX, '');
    return stripped.replace(/\s+/g, ' ').trim();
}

export function truncateInkText(text: string, max: number): string {
    if (!text) return '';
    if (text.length <= max) return text;
    if (max <= 3) return text.slice(0, max);
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}
