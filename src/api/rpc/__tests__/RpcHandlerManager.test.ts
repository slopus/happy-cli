import { describe, it, expect } from 'vitest';
import { RpcHandlerManager } from '../RpcHandlerManager';
import { decodeBase64, decrypt, encodeBase64, encrypt } from '@/api/encryption';

describe('RpcHandlerManager', () => {
  it('routes unscoped method names to scoped handlers', async () => {
    const key = new Uint8Array(32).fill(7);
    const encryptionVariant: 'legacy' = 'legacy';

    const manager = new RpcHandlerManager({
      scopePrefix: 'sid123',
      encryptionKey: key,
      encryptionVariant,
      logger: () => {},
    });

    let seen: unknown = null;
    manager.registerHandler('permission', async (params) => {
      seen = params;
      return { ok: true };
    });

    const encryptedParams = encodeBase64(encrypt(key, encryptionVariant, { id: 'p1', approved: true }));
    const response = await manager.handleRequest({ method: 'permission', params: encryptedParams });
    const decrypted = decrypt(key, encryptionVariant, decodeBase64(response));

    expect(seen).toEqual({ id: 'p1', approved: true });
    expect(decrypted).toEqual({ ok: true });
  });

  it('accepts already-scoped method names', async () => {
    const key = new Uint8Array(32).fill(9);
    const encryptionVariant: 'legacy' = 'legacy';

    const manager = new RpcHandlerManager({
      scopePrefix: 'sid123',
      encryptionKey: key,
      encryptionVariant,
      logger: () => {},
    });

    manager.registerHandler('permission', async () => ({ ok: true }));

    const encryptedParams = encodeBase64(encrypt(key, encryptionVariant, { id: 'p1', approved: true }));
    const response = await manager.handleRequest({ method: 'sid123:permission', params: encryptedParams });
    const decrypted = decrypt(key, encryptionVariant, decodeBase64(response));

    expect(decrypted).toEqual({ ok: true });
  });
});

