import { SessionMetadata } from '@happy/shared-types';
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
}