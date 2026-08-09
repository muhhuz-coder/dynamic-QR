import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { QrNotFoundError } from './errors';
import { updateQrMetadata } from './updateMetadata';

describe('updateQrMetadata (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `md-${suffix}`,
        shortCode: `MD${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('sets displayName and tags', async () => {
    const qrCode = await createTestQrCode();
    const updated = await updateQrMetadata(db, qrCode.qrName, {
      displayName: 'Front Counter Stand',
      tags: ['restaurant', 'counter'],
    });
    expect(updated.displayName).toBe('Front Counter Stand');
    expect(updated.tags).toEqual(['restaurant', 'counter']);
  });

  it('updates only the field provided, leaving the other untouched', async () => {
    const qrCode = await createTestQrCode();
    await updateQrMetadata(db, qrCode.qrName, { displayName: 'Original Name', tags: ['a'] });

    const updated = await updateQrMetadata(db, qrCode.qrName, { tags: ['a', 'b'] });
    expect(updated.displayName).toBe('Original Name');
    expect(updated.tags).toEqual(['a', 'b']);
  });

  it('clears displayName when explicitly set to null', async () => {
    const qrCode = await createTestQrCode();
    await updateQrMetadata(db, qrCode.qrName, { displayName: 'Temp' });
    const cleared = await updateQrMetadata(db, qrCode.qrName, { displayName: null });
    expect(cleared.displayName).toBeNull();
  });

  it('sets and clears expiresAt', async () => {
    const qrCode = await createTestQrCode();
    const isoDate = new Date(Date.now() + 86_400_000).toISOString();

    const updated = await updateQrMetadata(db, qrCode.qrName, { expiresAt: isoDate });
    expect(updated.expiresAt?.toISOString()).toBe(isoDate);

    const cleared = await updateQrMetadata(db, qrCode.qrName, { expiresAt: null });
    expect(cleared.expiresAt).toBeNull();
  });

  it('toggles utmEnabled', async () => {
    const qrCode = await createTestQrCode();
    expect(qrCode.utmEnabled).toBe(true);

    const updated = await updateQrMetadata(db, qrCode.qrName, { utmEnabled: false });
    expect(updated.utmEnabled).toBe(false);
  });

  it('sets and clears designOptions', async () => {
    const qrCode = await createTestQrCode();

    const updated = await updateQrMetadata(db, qrCode.qrName, {
      designOptions: {
        fgColor: '#2563eb',
        bgColor: '#ffffff',
        logoUrl: 'https://example.com/logo.png',
      },
    });
    expect(updated.designOptions).toEqual({
      fgColor: '#2563eb',
      bgColor: '#ffffff',
      logoUrl: 'https://example.com/logo.png',
    });

    const cleared = await updateQrMetadata(db, qrCode.qrName, { designOptions: null });
    expect(cleared.designOptions).toBeNull();
  });

  it('throws QrNotFoundError for an unknown QR name', async () => {
    await expect(updateQrMetadata(db, 'does-not-exist', { tags: ['x'] })).rejects.toThrow(
      QrNotFoundError,
    );
  });
});
