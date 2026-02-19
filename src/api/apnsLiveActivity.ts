/**
 * APNs Live Activity Push Client
 *
 * Sends remote updates to iOS Live Activity widgets via Apple Push Notification service.
 * Uses HTTP/2 with JWT authentication — no external dependencies beyond Node builtins.
 */

import http2 from 'node:http2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '@/ui/logger';

/** Matches HappySessionAttributes.ContentState in Swift */
export interface LiveActivityContentState {
    status: 'running' | 'waiting' | 'permission' | 'completed';
    taskCurrent: string | null;
    taskProgress: number | null;
    taskTotal: number | null;
    updatedAt: number;
}

interface ApnsConfig {
    keyId: string;
    teamId: string;
    privateKey: string;
    bundleId: string;
    production?: boolean;
}

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_DEV = 'api.sandbox.push.apple.com';
const JWT_VALIDITY_MS = 50 * 60 * 1000; // 50 minutes (APNs allows 60)

export class ApnsLiveActivityClient {
    private config: ApnsConfig | null = null;
    private cachedJwt: { token: string; issuedAt: number } | null = null;
    private h2Session: http2.ClientHttp2Session | null = null;

    constructor() {
        this.config = this.loadConfig();
        if (!this.config) {
            logger.debug('[APNs] Live Activity client disabled — missing credentials');
        } else {
            logger.debug(`[APNs] Live Activity client initialized (keyId=${this.config.keyId}, bundle=${this.config.bundleId})`);
        }
    }

    get isAvailable(): boolean {
        return this.config !== null;
    }

    /** Send a content-state update to a Live Activity */
    async update(pushToken: string, state: LiveActivityContentState): Promise<boolean> {
        return this.send(pushToken, 'update', state);
    }

    /** End a Live Activity remotely */
    async end(pushToken: string): Promise<boolean> {
        const state: LiveActivityContentState = {
            status: 'completed',
            taskCurrent: null,
            taskProgress: null,
            taskTotal: null,
            updatedAt: Date.now() / 1000,
        };
        return this.send(pushToken, 'end', state);
    }

    /** Tear down the HTTP/2 connection */
    destroy(): void {
        if (this.h2Session) {
            this.h2Session.close();
            this.h2Session = null;
        }
    }

    // ── Private ──────────────────────────────────────────────────────────

    private async send(
        pushToken: string,
        event: 'update' | 'end',
        state: LiveActivityContentState,
    ): Promise<boolean> {
        if (!this.config) return false;

        const payload = JSON.stringify({
            aps: {
                timestamp: Math.floor(Date.now() / 1000),
                event,
                'content-state': state,
                ...(event === 'end' && { 'dismissal-date': Math.floor(Date.now() / 1000) + 4 }),
            },
        });

        const jwt = this.getJwt();
        if (!jwt) return false;

        const host = this.config.production ? APNS_HOST_PROD : APNS_HOST_DEV;
        const topic = `${this.config.bundleId}.push-type.liveactivity`;

        try {
            const session = this.getH2Session(host);

            return new Promise<boolean>((resolve) => {
                const req = session.request({
                    ':method': 'POST',
                    ':path': `/3/device/${pushToken}`,
                    authorization: `bearer ${jwt}`,
                    'apns-topic': topic,
                    'apns-push-type': 'liveactivity',
                    'apns-priority': event === 'end' ? '5' : '10',
                });

                req.setEncoding('utf8');
                let responseData = '';
                let statusCode = 0;

                req.on('response', (headers) => {
                    statusCode = headers[':status'] as number;
                });

                req.on('data', (chunk) => {
                    responseData += chunk;
                });

                req.on('end', () => {
                    if (statusCode === 200) {
                        logger.debug(`[APNs] Live Activity ${event} sent (status=${state.status})`);
                        resolve(true);
                    } else {
                        logger.debug(`[APNs] Push failed: ${statusCode} ${responseData}`);
                        // Reset H2 session on auth errors
                        if (statusCode === 403) {
                            this.cachedJwt = null;
                        }
                        resolve(false);
                    }
                });

                req.on('error', (err) => {
                    logger.debug(`[APNs] Request error: ${err.message}`);
                    this.resetH2Session();
                    resolve(false);
                });

                req.end(payload);
            });
        } catch (err) {
            logger.debug(`[APNs] Send error: ${err}`);
            this.resetH2Session();
            return false;
        }
    }

    private getH2Session(host: string): http2.ClientHttp2Session {
        if (this.h2Session && !this.h2Session.closed && !this.h2Session.destroyed) {
            return this.h2Session;
        }

        this.h2Session = http2.connect(`https://${host}`);
        this.h2Session.on('error', (err) => {
            logger.debug(`[APNs] H2 session error: ${err.message}`);
            this.h2Session = null;
        });
        this.h2Session.on('goaway', () => {
            logger.debug('[APNs] H2 GOAWAY received, will reconnect on next push');
            this.h2Session = null;
        });

        return this.h2Session;
    }

    private resetH2Session(): void {
        if (this.h2Session) {
            try { this.h2Session.close(); } catch { /* ignore */ }
            this.h2Session = null;
        }
    }

    private getJwt(): string | null {
        if (!this.config) return null;

        // Return cached JWT if still valid
        if (this.cachedJwt && Date.now() - this.cachedJwt.issuedAt < JWT_VALIDITY_MS) {
            return this.cachedJwt.token;
        }

        try {
            const now = Math.floor(Date.now() / 1000);
            const header = Buffer.from(JSON.stringify({
                alg: 'ES256',
                kid: this.config.keyId,
            })).toString('base64url');

            const claims = Buffer.from(JSON.stringify({
                iss: this.config.teamId,
                iat: now,
            })).toString('base64url');

            const signingInput = `${header}.${claims}`;
            const sign = crypto.createSign('SHA256');
            sign.update(signingInput);
            const derSig = sign.sign(this.config.privateKey);

            // Convert DER signature to raw r||s (64 bytes) for ES256
            const rawSig = derToRaw(derSig);
            const signature = rawSig.toString('base64url');

            const token = `${signingInput}.${signature}`;
            this.cachedJwt = { token, issuedAt: Date.now() };
            return token;
        } catch (err) {
            logger.debug(`[APNs] JWT generation failed: ${err}`);
            return null;
        }
    }

    private loadConfig(): ApnsConfig | null {
        // Load from process.env first, fall back to ~/.happy/.env
        let keyId = process.env.APPLE_PUSH_KEY_ID;
        let teamId = process.env.APPLE_TEAM_ID;

        if (!keyId || !teamId) {
            const envFile = path.join(os.homedir(), '.happy', '.env');
            if (fs.existsSync(envFile)) {
                const envContent = fs.readFileSync(envFile, 'utf8');
                for (const line of envContent.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    const key = trimmed.slice(0, eqIdx).trim();
                    const value = trimmed.slice(eqIdx + 1).trim();
                    if (key === 'APPLE_PUSH_KEY_ID') keyId = value;
                    if (key === 'APPLE_TEAM_ID') teamId = value;
                }
            }
        }

        if (!keyId || !teamId) return null;

        // Try loading the .p8 key file
        const keyPath = process.env.APPLE_PUSH_KEY_FILE
            || path.join(os.homedir(), '.happy', 'apns-key.p8');

        if (!fs.existsSync(keyPath)) {
            logger.debug(`[APNs] Key file not found at ${keyPath}`);
            return null;
        }

        const privateKey = fs.readFileSync(keyPath, 'utf8').trim();

        // Determine bundle ID based on HAPPY_APP_VARIANT or default to dev
        const variant = process.env.HAPPY_APP_VARIANT || 'development';
        const bundleId = ({
            development: 'com.helsdingen.happy.dev',
            preview: 'com.helsdingen.happy.preview',
            production: 'com.helsdingen.happy',
        } as Record<string, string>)[variant] || 'com.helsdingen.happy.dev';

        return {
            keyId,
            teamId,
            privateKey,
            bundleId,
            production: variant === 'production',
        };
    }
}

/** Convert a DER-encoded ECDSA signature to raw r||s format (64 bytes) */
function derToRaw(derSig: Buffer): Buffer {
    const raw = Buffer.alloc(64);
    // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
    let offset = 2; // skip 0x30 <totalLen>
    // R
    offset += 1; // skip 0x02
    const rLen = derSig[offset++]!;
    const rStart = offset;
    offset += rLen;
    // S
    offset += 1; // skip 0x02
    const sLen = derSig[offset++]!;
    const sStart = offset;

    // Copy r (right-aligned to 32 bytes, skip leading zeros)
    if (rLen <= 32) {
        derSig.copy(raw, 32 - rLen, rStart, rStart + rLen);
    } else {
        derSig.copy(raw, 0, rStart + rLen - 32, rStart + rLen);
    }
    // Copy s (right-aligned to 32 bytes, skip leading zeros)
    if (sLen <= 32) {
        derSig.copy(raw, 64 - sLen, sStart, sStart + sLen);
    } else {
        derSig.copy(raw, 32, sStart + sLen - 32, sStart + sLen);
    }

    return raw;
}
