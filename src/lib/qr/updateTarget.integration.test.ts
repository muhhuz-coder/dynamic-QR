import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { InvalidTargetUrlError } from './batch';
import { QrNotFoundError } from './errors';
import { updateQrTarget } from './updateTarget';

describe('updateQrTarget (integration)', () => {
  const createdQrIds: string[] = [];
  const createdAdminIds: string[] = [];

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { adminId: { in: createdAdminIds } } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  async function createTestAdmin() {
    const admin = await db.admin.create({
      data: {
        email: `update-target-admin-${Date.now()}-${Math.random()}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
      },
    });
    createdAdminIds.push(admin.id);
    return admin;
  }

  async function createTestQrCode(targetUrl = 'https://old-target.example.com') {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `upd-${suffix}`,
        shortCode: `U${suffix}`.toUpperCase(),
        targetUrl,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('updates the target URL and records an audit log entry', async () => {
    const admin = await createTestAdmin();
    const qrCode = await createTestQrCode('https://old.example.com');

    const result = await updateQrTarget(db, qrCode.qrName, 'https://new.example.com', admin.id);

    expect(result).toEqual({
      qrName: qrCode.qrName,
      oldTarget: 'https://old.example.com',
      newTarget: 'https://new.example.com',
    });

    const updated = await db.qrCode.findUniqueOrThrow({ where: { id: qrCode.id } });
    expect(updated.targetUrl).toBe('https://new.example.com');
    expect(updated.targetUrlUpdatedAt).not.toBeNull();

    const logs = await db.auditLog.findMany({ where: { resourceId: qrCode.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      adminId: admin.id,
      action: 'UPDATE_QR_TARGET',
      resourceType: 'QR_CODE',
      oldValue: 'https://old.example.com',
      newValue: 'https://new.example.com',
    });
  });

  it('throws QrNotFoundError for an unknown QR name', async () => {
    const admin = await createTestAdmin();
    await expect(
      updateQrTarget(db, 'does-not-exist', 'https://example.com', admin.id),
    ).rejects.toThrow(QrNotFoundError);
  });

  it('rejects an unsafe target URL before touching the DB', async () => {
    const admin = await createTestAdmin();
    const qrCode = await createTestQrCode();

    await expect(
      updateQrTarget(db, qrCode.qrName, 'javascript:alert(1)', admin.id),
    ).rejects.toThrow(InvalidTargetUrlError);

    const unchanged = await db.qrCode.findUniqueOrThrow({ where: { id: qrCode.id } });
    expect(unchanged.targetUrl).toBe(qrCode.targetUrl);
  });
});
