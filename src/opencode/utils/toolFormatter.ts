/**
 * Tool Result Formatter
 * 
 * Formats tool results into human-readable Markdown/text for the UI.
 * This is purely for display purposes in the chat UI.
 * The actual agent receives the structured data via the backend connection.
 */

export function formatToolResult(toolName: string, result: any): string {
    if (result === undefined || result === null) {
        return 'No output';
    }

    try {
        switch (toolName) {
            case 'ls':
            case 'find':
            case 'glob':
                return formatList(result);
            case 'grep':
            case 'search':
                return formatGrep(result);
            case 'read':
                return formatRead(result);
            case 'write':
            case 'edit':
                return formatSuccess(result, toolName);
            default:
                return formatDefault(result);
        }
    } catch (error) {
        // Fallback to default if formatting fails
        return formatDefault(result);
    }
}

function formatList(result: any): string {
    if (Array.isArray(result)) {
        return formatListArray(result);
    }
    // Handle object with 'files' or similar property
    if (typeof result === 'object' && result !== null) {
        if (Array.isArray(result.files)) return formatListArray(result.files);
        if (Array.isArray(result.paths)) return formatListArray(result.paths);
        // Handle newline-separated string
        if (typeof result === 'string') return formatListArray(result.split('\n').filter(Boolean));
    }
    // Handle string output
    if (typeof result === 'string') {
        return formatListArray(result.split('\n').filter(Boolean));
    }
    return formatDefault(result);
}

function formatListArray(items: any[]): string {
    if (items.length === 0) return 'No files found.';
    
    // Truncate list
    const MAX_ITEMS = 50;
    const itemsToShow = items.slice(0, MAX_ITEMS);
    const remaining = items.length - MAX_ITEMS;
    
    let output = itemsToShow.map(item => `- ${String(item)}`).join('\n');
    
    if (remaining > 0) {
        output += `\n\n... and ${remaining} more items.`;
    }
    
    return output;
}

function formatRead(result: any): string {
    // Try to extract content using shared helper
    const content = extractContent(result);
    
    if (content !== null) {
        return `\`\`\`\n${truncateString(content, 2000)}\n\`\`\``;
    }

    // If result.content is missing but result is object (maybe complex structure)
    // fallback is handled by return formatDefault(result) below.
    // But formatDefault calls canFormatRead -> extractContent.
    // So if extractContent failed here, it will fail there too.
    
    return formatDefault(result);
}

function formatGrep(result: any): string {
    // Check for locations array
    if (typeof result === 'object' && result !== null && Array.isArray(result.locations)) {
        // If locations is empty, return "No matches found."
        if (result.locations.length === 0) {
             // Check if content is present (user edge case)
             const content = extractContent(result);
             if (content !== null) {
                 return `\`\`\`\n${truncateString(content, 2000)}\n\`\`\``;
             }
             return 'No matches found.';
        }
        // If locations has items, format them using formatGrep recursively
        return formatGrep(result.locations); 
    }

    // Grep output might be array of matches or string
    if (typeof result === 'string') {
        return `\`\`\`\n${truncateString(result, 2000)}\n\`\`\``;
    }
    
    if (Array.isArray(result)) {
        // Assume matches array
        const formatted = result.map(match => {
            if (typeof match === 'object' && match !== null) {
                const file = match.file || match.path || 'unknown';
                const line = match.line || '?';
                const text = match.content || match.text || match.match || '';
                return `${file}:${line}: ${text.trim()}`;
            }
            return String(match);
        });
        
        // Truncate
        const MAX_MATCHES = 20;
        const matchesToShow = formatted.slice(0, MAX_MATCHES);
        const remaining = formatted.length - MAX_MATCHES;
        
        let output = matchesToShow.join('\n');
        if (remaining > 0) {
            output += `\n\n... and ${remaining} more matches.`;
        }
        
        return `\`\`\`\n${output}\n\`\`\``;
    }
    
    return formatDefault(result);
}

function formatSuccess(result: any, toolName: string): string {
    // If result is empty string or "success", verify
    if (result === '' || result === 'success' || (typeof result === 'object' && Object.keys(result).length === 0)) {
        return `✅ ${toolName} completed successfully.`;
    }
    return formatDefault(result);
}

function formatDefault(result: any): string {
    if (typeof result === 'string') return result;
    
    // Auto-detection logic
    if (Array.isArray(result)) {
        return formatListArray(result);
    }
    
    if (typeof result === 'object' && result !== null) {
        // Check for content/text (like read result)
        const content = extractContent(result);
        if (content !== null) {
            return `\`\`\`\n${truncateString(content, 2000)}\n\`\`\``;
        }
        
        // Check for files/paths (like ls result)
        if (result.files || result.paths) {
            return formatList(result);
        }
        
        // Check for locations (like grep)
        if (result.locations) {
            return formatGrep(result);
        }
    }

    try {
        return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    } catch {
        return String(result);
    }
}

// Shared helper to extract content string from various structures
function extractContent(result: any): string | null {
    if (typeof result === 'string') return result;
    
    if (typeof result === 'object' && result !== null) {
        // Direct text property
        if (result.text && typeof result.text === 'string') return result.text;
        
        // Content property
        if (result.content) {
            // String content
            if (typeof result.content === 'string') return result.content;
            
            // Array content (MCP)
            if (Array.isArray(result.content)) {
                const parts = result.content
                    .filter((item: any) => item.type === 'text' && typeof item.text === 'string')
                    .map((item: any) => item.text);
                if (parts.length > 0) return parts.join('\n');
            }
            
            // Object content
            if (typeof result.content === 'object') {
                if (result.content.text && typeof result.content.text === 'string') return result.content.text;
                if (result.content.value && typeof result.content.value === 'string') return result.content.value;
            }
        }
    }
    return null;
}

function truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + `\n\n... (truncated ${str.length - maxLength} chars)`;
}
