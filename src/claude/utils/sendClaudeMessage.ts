import { SessionApiClient } from '@happy-engineering/happy-api-client';
import { MessageContent } from '@happy/shared-types';
import { RawJSONLines } from '@/claude/types';

/**
 * Helper function to send Claude messages through the session client
 * Converts Claude's raw JSON lines format to the API's MessageContent format
 */
export function sendClaudeMessage(client: SessionApiClient, body: RawJSONLines) {
    let content: MessageContent;

    // Check if body is a user message
    if (body.type === 'user' && typeof body.message.content === 'string' && body.isSidechain !== true && body.isMeta !== true) {
        content = {
            role: 'user',
            content: {
                type: 'text',
                text: body.message.content
            },
            meta: {
                sentFrom: 'cli'
            }
        }
    } else {
        // Wrap Claude messages in the expected format
        content = {
            role: 'agent',
            content: {
                type: 'output',
                data: body
            },
            meta: {
                sentFrom: 'cli'
            }
        };
    }

    client.sendMessage(content);
}