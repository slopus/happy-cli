/**
 * Test Response Fixtures
 *
 * Pre-defined responses for testing various scenarios
 */

/**
 * Generate a streaming response with multiple chunks
 */
export function generateStreamingResponse(chunkCount: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(`Chunk ${i + 1} of content. `);
  }
  return chunks;
}

/**
 * Generate a response with options XML
 */
export function generateOptionsResponse(options: string[]): string {
  return `Here are your options:

<options>
${options.map(opt => `    <option>${opt}</option>`).join('\n')}
</options>

Let me know which one you'd like to choose.`;
}

/**
 * Test responses for various scenarios
 */
export const FIXTURE_RESPONSES = {
  simple: 'Hello! How can I help you today?',
  withOptions: generateOptionsResponse(['Option A', 'Option B', 'Option C']),
  streaming: generateStreamingResponse(50),
  incomplete: 'This response is incomplete and will be continued',
  withCode: 'Here\'s a function:\n\nfunction sort(arr) {\n  return arr.sort();\n}',
  empty: '',
  withMarkdown: '# Title\n\nThis is **bold** and *italic* text.',
  withUnicode: 'Response with emoji: 🎉🚀⭐ and 中文',
  veryLong: 'Long response: ' + 'word '.repeat(5000),
} as const;

/**
 * ACP message fixtures for backend testing
 */
export const ACP_MESSAGES = {
  agentMessageChunk: {
    type: 'agent_message_chunk',
    data: { content: 'Partial response', complete: false },
  },
  agentThoughtChunk: {
    type: 'agent_thought_chunk',
    data: { thought: 'Thinking about the answer' },
  },
  toolCall: {
    type: 'tool_call',
    data: {
      id: 'call-123',
      name: 'write_file',
      arguments: { path: '/tmp/test.txt', content: 'test' },
    },
  },
  toolCallUpdate: {
    type: 'tool_call_update',
    data: { id: 'call-123', status: 'completed' },
  },
  permissionRequest: {
    type: 'permission_request',
    data: {
      id: 'perm-123',
      tool: 'write_file',
      arguments: { path: '/tmp/test.txt' },
    },
  },
} as const;

/**
 * Error scenarios for testing
 */
export const ERROR_SCENARIOS = {
  timeout: {
    name: 'TimeoutError',
    message: 'Request timed out after 30000ms',
  },
  connectionRefused: {
    name: 'ConnectionRefused',
    message: 'Could not connect to ACP server',
  },
  parseError: {
    name: 'ParseError',
    message: 'Failed to parse ACP response',
  },
  invalidResponse: {
    name: 'InvalidResponse',
    message: 'Received invalid response from ACP',
  },
} as const;
