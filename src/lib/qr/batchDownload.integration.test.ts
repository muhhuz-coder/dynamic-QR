import { afterAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { db } from '@/lib/db/client';

import {
  BatchNotFoundError,
  buildBatchSvgZip,
  buildQrCodesSvgZip,
  NoQrCodesFoundError,
} from './batchDownload';

describe('buildBatchSvgZip (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  it('zips one named SVG per QR code in the batch', async () => {
    const batchId = `batch-dl-test-${Date.now()}`;
    const created = await Promise.all(
      ['coin-a', 'coin-b'].map(async (name) => {
        const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const qr = await db.qrCode.create({
          data: {
            qrName: `${name}-${suffix}`,
            shortCode: `D${suffix}${name}`.toUpperCase(),
            targetUrl: 'https://example.com',
            batchId,
          },
        });
        createdQrIds.push(qr.id);
        return qr;
      }),
    );

    const zipBuffer = await buildBatchSvgZip(db, batchId, 'http://localhost:3000');
    const zip = await JSZip.loadAsync(zipBuffer);

    const filenames = Object.keys(zip.files).sort();
    expect(filenames).toEqual(created.map((q) => `${q.qrName}.svg`).sort());

    const firstSvg = await zip.files[`${created[0].qrName}.svg`].async('string');
    expect(firstSvg).toContain('<svg');
  });

  it('sizes each SVG per its own productType — a batch can mix coins, cards, and stands', async () => {
    const batchId = `batch-dl-mixed-${Date.now()}`;
    const created = await Promise.all(
      (['COIN', 'CARD', 'STAND'] as const).map(async (productType) => {
        const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const qr = await db.qrCode.create({
          data: {
            qrName: `${productType.toLowerCase()}-${suffix}`,
            shortCode: `M${suffix}${productType}`.toUpperCase(),
            targetUrl: 'https://example.com',
            batchId,
            productType,
          },
        });
        createdQrIds.push(qr.id);
        return qr;
      }),
    );

    const zipBuffer = await buildBatchSvgZip(db, batchId, 'http://localhost:3000');
    const zip = await JSZip.loadAsync(zipBuffer);

    const expectedSizes = { COIN: 28, CARD: 30, STAND: 80 };
    for (const qr of created) {
      const svg = await zip.files[`${qr.qrName}.svg`].async('string');
      expect(svg).toContain(`width="${expectedSizes[qr.productType!]}mm"`);
    }
  });

  it('throws BatchNotFoundError for an unknown/empty batch', async () => {
    await expect(buildBatchSvgZip(db, 'does-not-exist', 'http://localhost:3000')).rejects.toThrow(
      BatchNotFoundError,
    );
  });
});

describe('buildQrCodesSvgZip (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  it('zips an arbitrary cross-batch selection by qrName', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const a = await db.qrCode.create({
      data: {
        qrName: `sel-a-${suffix}`,
        shortCode: `SA${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        batchId: 'batch-1',
      },
    });
    const b = await db.qrCode.create({
      data: {
        qrName: `sel-b-${suffix}`,
        shortCode: `SB${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        batchId: 'batch-2',
      },
    });
    createdQrIds.push(a.id, b.id);

    const zipBuffer = await buildQrCodesSvgZip(db, [a.qrName, b.qrName], 'http://localhost:3000');
    const zip = await JSZip.loadAsync(zipBuffer);
    expect(Object.keys(zip.files).sort()).toEqual([`${a.qrName}.svg`, `${b.qrName}.svg`].sort());
  });

  it('throws NoQrCodesFoundError when none of the names match', async () => {
    await expect(
      buildQrCodesSvgZip(db, ['does-not-exist'], 'http://localhost:3000'),
    ).rejects.toThrow(NoQrCodesFoundError);
  });
});
