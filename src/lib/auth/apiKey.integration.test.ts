import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from './apiKey';

describe('apiKey (integration)', () => {
  const createdKeyIds: string[] = [];

  afterAll(async () => {
    await db.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } });
    await db.$disconnect();
  });

  it('creates a key and returns the raw value once', async () => {
    const { id, rawKey } = await createApiKey(db, 'Test key');
    createdKeyIds.push(id);
    expect(rawKey).toMatch(/^tnr_[0-9a-f]{48}$/);
  });

  it('never stores the raw key — only its hash', async () => {
    const { id, rawKey } = await createApiKey(db, 'Test key');
    createdKeyIds.push(id);
    const record = await db.apiKey.findUniqueOrThrow({ where: { id } });
    expect(record.hashedKey).not.toBe(rawKey);
  });

  it('verifies a valid raw key and bumps lastUsedAt', async () => {
    const { id, rawKey } = await createApiKey(db, 'Test key');
    createdKeyIds.push(id);

    expect(await verifyApiKey(db, rawKey)).toBe(true);
    const record = await db.apiKey.findUniqueOrThrow({ where: { id } });
    expect(record.lastUsedAt).not.toBeNull();
  });

  it('rejects an unknown/invalid raw key', async () => {
    expect(await verifyApiKey(db, 'tnr_not-a-real-key')).toBe(false);
  });

  it('lists keys without exposing the hash', async () => {
    const { id } = await createApiKey(db, 'List test key');
    createdKeyIds.push(id);
    const keys = await listApiKeys(db);
    expect(keys.find((k) => k.id === id)).not.toHaveProperty('hashedKey');
  });

  it('revokes a key so it no longer verifies', async () => {
    const { id, rawKey } = await createApiKey(db, 'Revoke test key');
    await revokeApiKey(db, id);
    expect(await verifyApiKey(db, rawKey)).toBe(false);
  });
});
