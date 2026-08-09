import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { deleteQrCode, deleteQrCodes } from './delete';
import { QrNotFoundError } from './errors';

describe('delete (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrScanEvent.deleteMany({ where: { qrId: { in: createdQrIds } } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `del-${suffix}`,
        shortCode: `DL${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  describe('deleteQrCode', () => {
    it('deletes the QR and its scan events', async () => {
      const qrCode = await createTestQrCode();
      await db.qrScanEvent.create({
        data: { qrId: qrCode.id, shortCode: qrCode.shortCode, targetUrlAtScan: qrCode.targetUrl },
      });

      await deleteQrCode(db, qrCode.qrName);

      expect(await db.qrCode.findUnique({ where: { id: qrCode.id } })).toBeNull();
      expect(await db.qrScanEvent.findMany({ where: { qrId: qrCode.id } })).toHaveLength(0);
    });

    it('throws QrNotFoundError for an unknown name', async () => {
      await expect(deleteQrCode(db, 'does-not-exist')).rejects.toThrow(QrNotFoundError);
    });
  });

  describe('deleteQrCodes (bulk)', () => {
    it('deletes multiple by name and reports the count, skipping unknown names', async () => {
      const a = await createTestQrCode();
      const b = await createTestQrCode();

      const result = await deleteQrCodes(db, [a.qrName, b.qrName, 'does-not-exist']);

      expect(result.deletedCount).toBe(2);
      expect(await db.qrCode.findUnique({ where: { id: a.id } })).toBeNull();
      expect(await db.qrCode.findUnique({ where: { id: b.id } })).toBeNull();
    });
  });
});
