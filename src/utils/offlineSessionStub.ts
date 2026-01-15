/**
 * Offline Session Stub Factory
 *
 * Creates a no-op session stub for offline mode that can be used across all backends
 * (Claude, Codex, Gemini, etc.). All session methods become no-ops until reconnection.
 *
 * This follows DRY principles by providing a single implementation for all backends,
 * satisfying REQ-8 from serverConnectionErrors.ts.
 *
 * @module offlineSessionStub
 */

import { EventEmitter } from 'node:events';
import type { ApiSessionClient } from '@/api/apiSession';

class OfflineSessionStub extends EventEmitter {
    sessionId: string;
    rpcHandlerManager: { registerHandler: () => void };

    constructor(sessionId: string) {
        super();
        this.sessionId = sessionId;
        this.rpcHandlerManager = {
            registerHandler: () => {},
        };
    }

    sendCodexMessage(): void {}
    sendClaudeSessionMessage(): void {}
    keepAlive(): void {}
    sendSessionEvent(): void {}
    sendSessionDeath(): void {}
    updateLifecycleState(): void {}
    requestControlTransfer = async (): Promise<void> => {};
    flush = async (): Promise<void> => {};
    close = async (): Promise<void> => {};
    updateMetadata(): void {}
    updateAgentState(): void {}
    onUserMessage(): void {}
}

/**
 * Creates a no-op session stub for offline mode.
 *
 * The stub implements the ApiSessionClient interface with no-op methods,
 * allowing the application to continue running while offline. When reconnection
 * succeeds, the real session replaces this stub.
 *
 * @param sessionTag - Unique session tag (used to create offline session ID)
 * @returns A no-op ApiSessionClient stub
 *
 * @example
 * ```typescript
 * const offlineStub = createOfflineSessionStub(sessionTag);
 * let session: ApiSessionClient = offlineStub;
 *
 * // When reconnected:
 * session = api.sessionSyncClient(response);
 * ```
 */
export function createOfflineSessionStub(sessionTag: string): ApiSessionClient {
    return new OfflineSessionStub(`offline-${sessionTag}`) as unknown as ApiSessionClient;
}
