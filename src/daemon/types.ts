import { SessionMetadata } from 'happy-api-client';
import { ChildProcess } from 'child_process';

/**
 * Session tracking for daemon
 */
export interface TrackedSession {
    startedBy: 'daemon' | string;
    happySessionId?: string;
    happySessionMetadataFromLocalWebhook?: SessionMetadata;
    pid: number;
    childProcess?: ChildProcess;
    directory: string;
    startedAt: number;
}