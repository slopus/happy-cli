import axios from 'axios'
import { logger } from '@/ui/logger'
import type { AgentState, CreateSessionResponse, SessionMetadata, Session, Machine, MachineMetadata, DaemonState } from '@happy/shared-types'
import { EncryptedMachineSchema } from '@happy/shared-types'
import { ApiSessionClient } from './apiSession';
import { ApiMachineClient } from './apiMachine';
import { decodeBase64, decrypt, encodeBase64, encrypt } from './encryption';
import { PushNotificationClient } from './pushNotifications';
import { configuration } from '@/configuration';

export class ApiClient {
  private readonly token: string;
  private readonly secret: Uint8Array;
  private readonly pushClient: PushNotificationClient;

  constructor(token: string, secret: Uint8Array) {
    this.token = token
    this.secret = secret
    this.pushClient = new PushNotificationClient(token)
  }

  /**
   * Create a new session or load existing one with the given tag
   */
  async getOrCreateSession(opts: { tag: string, metadata: SessionMetadata, state: AgentState | null }): Promise<Session> {
    try {
      const response = await axios.post<CreateSessionResponse>(
        `${configuration.serverUrl}/v1/sessions`,
        {
          tag: opts.tag,
          metadata: encodeBase64(encrypt(opts.metadata, this.secret)),
          agentState: opts.state ? encodeBase64(encrypt(opts.state, this.secret)) : null
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5 second timeout
        }
      )

      logger.debug(`Session created/loaded: ${response.data.session.id} (tag: ${opts.tag})`)
      let raw = response.data.session;
      let session: Session = {
        id: raw.id,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        seq: raw.seq,
        metadata: decrypt(decodeBase64(raw.metadata), this.secret),
        metadataVersion: raw.metadataVersion,
        agentState: raw.agentState ? decrypt(decodeBase64(raw.agentState), this.secret) : null,
        agentStateVersion: raw.agentStateVersion
      }
      return session;
    } catch (error) {
      logger.debug('[API] [ERROR] Failed to get or create session:', error);
      throw new Error(`Failed to get or create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get machine by ID from the server
   * Returns the current machine state from the server with decrypted metadata and daemonState
   */
  async getMachine(machineId: string): Promise<Machine | null> {
    const response = await axios.get(`${configuration.serverUrl}/v1/machines/${machineId}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 2000
    });

    const raw = response.data.machine;
    if (!raw) {
      return null;
    }

    // Validate the API response
    const parsed = EncryptedMachineSchema.safeParse(raw);
    if (!parsed.success) {
      logger.debug(`[API] Invalid machine data from server:`, parsed.error);
      throw new Error(`Invalid machine data: ${parsed.error.message}`);
    }
    const encryptedMachine = parsed.data;

    logger.debug(`[API] Machine ${machineId} fetched from server`);

    // Decrypt metadata and daemonState like we do for sessions
    const machine: Machine = {
      id: encryptedMachine.id,
      seq: encryptedMachine.seq,
      metadata: encryptedMachine.metadata ? decrypt(decodeBase64(encryptedMachine.metadata), this.secret) : null,
      metadataVersion: parsed.data.metadataVersion,
      daemonState: encryptedMachine.daemonState ? decrypt(decodeBase64(encryptedMachine.daemonState), this.secret) : null,
      daemonStateVersion: encryptedMachine.daemonStateVersion,
      active: encryptedMachine.active,
      activeAt: encryptedMachine.activeAt,
      createdAt: encryptedMachine.createdAt,
      updatedAt: encryptedMachine.updatedAt
    };
    return machine;
  }

  /**
   * Register or update machine with the server
   * Returns the current machine state from the server with decrypted metadata and daemonState
   */
  async createOrReturnExistingAsIs(opts: {
    machineId: string,
    metadata: MachineMetadata,
    daemonState: DaemonState
  }): Promise<Machine> {
    const response = await axios.post(
      `${configuration.serverUrl}/v1/machines`,
      {
        id: opts.machineId,
        metadata: encodeBase64(encrypt(opts.metadata, this.secret)),
        daemonState: opts.daemonState ? encodeBase64(encrypt(opts.daemonState, this.secret)) : undefined
      },
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    const raw = response.data.machine;

    // Validate the API response
    const parsed = EncryptedMachineSchema.safeParse(raw);
    if (!parsed.success) {
      logger.debug(`[API] Invalid machine data from server:`, parsed.error);
      throw new Error(`Invalid machine data: ${parsed.error.message}`);
    }

    logger.debug(`[API] Machine ${opts.machineId} registered/updated with server`);

    // Return decrypted machine like we do for sessions
    const machine: Machine = {
      id: parsed.data.id,
      seq: parsed.data.seq,
      metadata: parsed.data.metadata ? decrypt(decodeBase64(parsed.data.metadata), this.secret) : null,
      metadataVersion: parsed.data.metadataVersion,
      daemonState: parsed.data.daemonState ? decrypt(decodeBase64(parsed.data.daemonState), this.secret) : null,
      daemonStateVersion: parsed.data.daemonStateVersion,
      active: parsed.data.active,
      activeAt: parsed.data.activeAt,
      createdAt: parsed.data.createdAt,
      updatedAt: parsed.data.updatedAt
    };
    return machine;
  }

  sessionSyncClient(session: Session): ApiSessionClient {
    return new ApiSessionClient(this.token, this.secret, session);
  }

  machineSyncClient(machine: Machine): ApiMachineClient {
    return new ApiMachineClient(this.token, this.secret, machine);
  }

  push(): PushNotificationClient {
    return this.pushClient;
  }
}
