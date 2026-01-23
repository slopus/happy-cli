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
    let content = '';
    if (typeof result === 'string') {
        content = result;
    } else if (typeof result === 'object' && result !== null) {
        // Handle result.content.text (common MCP pattern)
        if (result.content) {
            if (typeof result.content === 'string') {
                content = result.content;
            } else if (typeof result.content === 'object' && result.content !== null) {
                if (result.content.text && typeof result.content.text === 'string') {
                    content = result.content.text;
                } else if (result.content.value && typeof result.content.value === 'string') {
                    content = result.content.value;
                }
            }
        }
        // Handle direct result.text
        else if (result.text && typeof result.text === 'string') {
            content = result.text;
        }
    } else {
        return formatDefault(result);
    }
    
    if (!content && typeof result === 'object') {
        // Failed to extract string, but it is an object.
        // If it's the exact structure user reported (locations + content.text)
        // Check if content.text is present
        if (result.content && result.content.text) {
             content = result.content.text;
        }
    }

    if (!content) return formatDefault(result); // Failed to extract string

    return `\`\`\`\n${truncateString(content, 2000)}\n\`\`\``;
}

function formatGrep(result: any): string {
    // Check for locations array
    if (typeof result === 'object' && result !== null && Array.isArray(result.locations)) {
        // If locations is empty, return "No matches found."
        if (result.locations.length === 0) {
             // Sometimes locations=[] means no matches, but content might contain info?
             // User example: locations=[], content={text: "..."}.
             // If content is present, maybe it's actually a 'read' result mislabeled or a search result with context?
             // If content is present, verify if it's "text".
             if (result.content && result.content.text) {
                 // It's likely file content. Treat as read?
                 // Or format as "No matches in: \n ```\n...\n```"
                 // Or just return the content.
                 return `\`\`\`\n${truncateString(result.content.text, 2000)}\n\`\`\``;
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
    try {
        return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    } catch {
        return String(result);
    }
}

function truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + `\n\n... (truncated ${str.length - maxLength} chars)`;
}
