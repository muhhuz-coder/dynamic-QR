import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { getQrAnalytics } from './analytics';
import { QrNotFoundError } from './errors';

describe('getQrAnalytics (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrScanEvent.deleteMany({ where: { qrId: { in: createdQrIds } } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `analytics-test-${Date.now()}-${Math.random()}`,
        shortCode: `A${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('aggregates scan events by method, device, and location', async () => {
    const qrCode = await createTestQrCode();

    await db.qrScanEvent.createMany({
      data: [
        {
          qrId: qrCode.id,
          scanMethod: 'QR_SCAN',
          deviceType: 'MOBILE',
          locationCity: 'Lahore',
          targetUrlAtScan: qrCode.targetUrl,
        },
        {
          qrId: qrCode.id,
          scanMethod: 'NFC_TAP',
          deviceType: 'DESKTOP',
          locationCity: 'Lahore',
          targetUrlAtScan: qrCode.targetUrl,
        },
        {
          qrId: qrCode.id,
          scanMethod: 'QR_SCAN',
          deviceType: 'TABLET',
          locationCity: 'Karachi',
          targetUrlAtScan: qrCode.targetUrl,
        },
      ],
    });

    const analytics = await getQrAnalytics(db, qrCode.qrName, '30d');

    expect(analytics.totalScans).toBe(3);
    expect(analytics.byMethod).toEqual({ nfc: 1, qr: 2 });
    expect(analytics.byDevice).toEqual({ mobile: 1, desktop: 1, tablet: 1 });
    expect(analytics.byLocation).toEqual({ Lahore: 2, Karachi: 1 });
    expect(analytics.hourlyDistribution).not.toBeNull();
    expect(analytics.recentScans).toHaveLength(3);
  });

  it('omits hourlyDistribution for the 90d/all periods', async () => {
    const qrCode = await createTestQrCode();
    const analytics = await getQrAnalytics(db, qrCode.qrName, '90d');
    expect(analytics.hourlyDistribution).toBeNull();
  });

  it('excludes scan events outside the requested period', async () => {
    const qrCode = await createTestQrCode();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    await db.qrScanEvent.create({
      data: {
        qrId: qrCode.id,
        scanTimestamp: eightDaysAgo,
        targetUrlAtScan: qrCode.targetUrl,
      },
    });

    const analytics = await getQrAnalytics(db, qrCode.qrName, '7d');
    expect(analytics.totalScans).toBe(0);
  });

  it('throws QrNotFoundError for an unknown QR name', async () => {
    await expect(getQrAnalytics(db, 'does-not-exist', '30d')).rejects.toThrow(QrNotFoundError);
  });
});
