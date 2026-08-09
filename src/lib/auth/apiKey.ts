import { createHash, randomBytes } from 'node:crypto';

import type { PrismaClient } from '@/generated/prisma/client';

const KEY_PREFIX = 'tnr_';

/** SHA-256 is fine here (unlike passwords, API keys are already high-entropy random tokens, not guessable secrets a user chose). */
function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Creates a new API key. Returns the raw key exactly once — only its hash is
 * stored, mirroring how the raw value can never be shown again after this call.
 */
export async function createApiKey(
  db: PrismaClient,
  label: string,
): Promise<{ id: string; rawKey: string }> {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const created = await db.apiKey.create({ data: { label, hashedKey: hashKey(rawKey) } });
  return { id: created.id, rawKey };
}

export function listApiKeys(db: PrismaClient) {
  return db.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  });
}

export async function revokeApiKey(db: PrismaClient, id: string): Promise<void> {
  await db.apiKey.delete({ where: { id } });
}

/** Verifies a raw key from an Authorization header and bumps lastUsedAt — used by requireApiKey. */
export async function verifyApiKey(db: PrismaClient, rawKey: string): Promise<boolean> {
  const record = await db.apiKey.findUnique({ where: { hashedKey: hashKey(rawKey) } });
  if (!record) return false;

  await db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return true;
}
