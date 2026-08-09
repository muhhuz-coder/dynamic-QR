import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import {
  DuplicateQrNamesError,
  InvalidTargetUrlError,
  buildBatchEntriesFromBaseName,
  createQrBatch,
} from './batch';

describe('createQrBatch (integration)', () => {
  const createdBatchIds: string[] = [];

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { batchId: { in: createdBatchIds } } });
    await db.$disconnect();
  });

  function uniqueBaseName(label: string) {
    return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  it('creates a batch of QR codes with unique short codes', async () => {
    const baseName = uniqueBaseName('batch-happy');
    const entries = buildBatchEntriesFromBaseName(baseName, 3, 'https://example.com');

    const result = await createQrBatch(db, entries, baseName);
    createdBatchIds.push(result.batchId);

    expect(result.totalCreated).toBe(3);
    expect(result.qrs.map((q) => q.qrName)).toEqual([baseName, `${baseName}-02`, `${baseName}-03`]);

    const shortCodes = result.qrs.map((q) => q.shortCode);
    expect(new Set(shortCodes).size).toBe(3);

    const rows = await db.qrCode.findMany({ where: { batchId: result.batchId } });
    expect(rows).toHaveLength(3);
  });

  it('rejects a batch containing a name that already exists in the DB', async () => {
    const baseName = uniqueBaseName('batch-dup');
    const first = await createQrBatch(
      db,
      buildBatchEntriesFromBaseName(baseName, 1, 'https://example.com'),
      baseName,
    );
    createdBatchIds.push(first.batchId);

    await expect(
      createQrBatch(
        db,
        buildBatchEntriesFromBaseName(baseName, 1, 'https://example.com'),
        baseName,
      ),
    ).rejects.toThrow(DuplicateQrNamesError);
  });

  it('rejects a batch with an invalid target URL before touching the DB', async () => {
    const baseName = uniqueBaseName('batch-badurl');
    await expect(
      createQrBatch(
        db,
        buildBatchEntriesFromBaseName(baseName, 1, 'javascript:alert(1)'),
        baseName,
      ),
    ).rejects.toThrow(InvalidTargetUrlError);

    const rows = await db.qrCode.findMany({ where: { qrName: baseName } });
    expect(rows).toHaveLength(0);
  });

  it('rejects duplicate names within the same submitted batch', async () => {
    const baseName = uniqueBaseName('batch-selfdup');
    const entries = [
      { qrName: baseName, targetUrl: 'https://example.com' },
      { qrName: baseName, targetUrl: 'https://example.com' },
    ];
    await expect(createQrBatch(db, entries, baseName)).rejects.toThrow(DuplicateQrNamesError);
  });
});
