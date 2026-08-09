import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { DuplicateQrNamesError } from './batch';
import { createContentQr } from './createContentQr';
import { InvalidContentPayloadError } from './contentTypes';

describe('createContentQr (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  it('creates a VCARD QR with a derived label in targetUrl', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await createContentQr(db, `vcard-${suffix}`, 'VCARD', { name: 'Jane Doe' });
    createdQrIds.push(qrCode.id);

    expect(qrCode.contentType).toBe('VCARD');
    expect(qrCode.contentPayload).toEqual({ name: 'Jane Doe' });
    expect(qrCode.targetUrl).toBe('vCard: Jane Doe');
    expect(qrCode.shortCode).toMatch(/^[A-Z0-9]+$/);
  });

  it('creates a WIFI QR with a productType', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await createContentQr(
      db,
      `wifi-${suffix}`,
      'WIFI',
      { ssid: 'MyNetwork' },
      'CARD',
    );
    createdQrIds.push(qrCode.id);

    expect(qrCode.productType).toBe('CARD');
    expect(qrCode.targetUrl).toBe('Wi-Fi: MyNetwork');
  });

  it('rejects an invalid payload before touching the database', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrName = `bad-${suffix}`;
    await expect(createContentQr(db, qrName, 'VCARD', {} as never)).rejects.toThrow(
      InvalidContentPayloadError,
    );
    expect(await db.qrCode.findUnique({ where: { qrName } })).toBeNull();
  });

  it('throws DuplicateQrNamesError for an existing name', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrName = `dup-${suffix}`;
    const first = await createContentQr(db, qrName, 'TEXT', { text: 'hello' });
    createdQrIds.push(first.id);

    await expect(createContentQr(db, qrName, 'TEXT', { text: 'again' })).rejects.toThrow(
      DuplicateQrNamesError,
    );
  });
});
