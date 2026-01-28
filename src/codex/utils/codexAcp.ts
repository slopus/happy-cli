import { logger } from '@/ui/logger';
import type { ACPMessageData } from '@/api/apiSession';

export type CodexMessage =
  | { type: 'message'; message: string; id?: string }
  | { type: 'reasoning'; message: string; id?: string }
  | { type: 'tool-call'; name: string; callId: string; input: unknown; id?: string }
  | { type: 'tool-call-result'; callId: string; output: unknown; id?: string; isError?: boolean }
  | { type: 'token_count'; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

export function codexMessageToAcp(message: CodexMessage): ACPMessageData | null {
  switch (message.type) {
    case 'message':
      if (typeof message.message !== 'string') {
        logger.debug('[codex] Missing message text; dropping message', { message });
        return null;
      }
      return { type: 'message', message: message.message };
    case 'reasoning':
      if (typeof message.message !== 'string') {
        logger.debug('[codex] Missing reasoning text; dropping message', { message });
        return null;
      }
      return { type: 'reasoning', message: message.message };
    case 'tool-call': {
      if (typeof message.callId !== 'string' || typeof message.name !== 'string' || typeof message.id !== 'string') {
        logger.debug('[codex] Missing tool-call fields; dropping message', { message });
        return null;
      }
      return {
        type: 'tool-call',
        callId: message.callId,
        name: message.name,
        input: message.input,
        id: message.id,
      };
    }
    case 'tool-call-result': {
      if (typeof message.callId !== 'string' || typeof message.id !== 'string') {
        logger.debug('[codex] Missing tool-call-result callId; dropping message', { message });
        return null;
      }
      return {
        type: 'tool-result',
        callId: message.callId,
        output: message.output,
        id: message.id,
        ...(typeof message.isError === 'boolean' ? { isError: message.isError } : {}),
      };
    }
    case 'token_count':
      return message as ACPMessageData;
    default:
      logger.debug('[codex] Unsupported message type for ACP', { type: message.type });
      return null;
  }
}
