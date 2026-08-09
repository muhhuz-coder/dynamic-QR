import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { duplicateQrCode } from './duplicate';
import { QrNotFoundError } from './errors';

describe('duplicateQrCode (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode(
    overrides: Partial<{ productType: 'CARD' | 'COIN' | 'STAND'; tags: string[] }> = {},
  ) {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `dup-${suffix}`,
        shortCode: `DP${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        displayName: 'Original',
        ...overrides,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('copies target/productType/displayName/tags with a fresh name and short code', async () => {
    const source = await createTestQrCode({ productType: 'COIN', tags: ['a', 'b'] });

    const copy = await duplicateQrCode(db, source.qrName);
    createdQrIds.push(copy.id);

    expect(copy.qrName).toBe(`${source.qrName}-copy`);
    expect(copy.shortCode).not.toBe(source.shortCode);
    expect(copy.targetUrl).toBe(source.targetUrl);
    expect(copy.productType).toBe('COIN');
    expect(copy.displayName).toBe('Original');
    expect(copy.tags).toEqual(['a', 'b']);
  });

  it('increments the suffix when a copy already exists', async () => {
    const source = await createTestQrCode();
    const firstCopy = await duplicateQrCode(db, source.qrName);
    createdQrIds.push(firstCopy.id);

    const secondCopy = await duplicateQrCode(db, source.qrName);
    createdQrIds.push(secondCopy.id);

    expect(secondCopy.qrName).toBe(`${source.qrName}-copy-2`);
  });

  it('throws QrNotFoundError for an unknown name', async () => {
    await expect(duplicateQrCode(db, 'does-not-exist')).rejects.toThrow(QrNotFoundError);
  });
});
