import type { PrismaClient, QrCode } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';
import { generateUniqueShortCode } from './shortCode';

/** Finds a free `<qrName>-copy`, `<qrName>-copy-2`, etc. */
async function generateCopyName(db: PrismaClient, baseName: string): Promise<string> {
  let candidate = `${baseName}-copy`;
  let suffix = 2;
  while (await db.qrCode.findUnique({ where: { qrName: candidate } })) {
    candidate = `${baseName}-copy-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Duplicates a QR code ("Copy" in the competitor's UI): same target/productType/
 * tags, but a fresh qrName and shortCode — it's a genuinely new, separately
 * scannable QR, not an alias.
 */
export async function duplicateQrCode(db: PrismaClient, qrName: string): Promise<QrCode> {
  const source = await db.qrCode.findUnique({ where: { qrName } });
  if (!source) {
    throw new QrNotFoundError(qrName);
  }

  const newName = await generateCopyName(db, source.qrName);
  const newShortCode = await generateUniqueShortCode(
    async (code) => (await db.qrCode.findUnique({ where: { shortCode: code } })) !== null,
  );

  return db.qrCode.create({
    data: {
      qrName: newName,
      shortCode: newShortCode,
      targetUrl: source.targetUrl,
      productType: source.productType,
      displayName: source.displayName,
      tags: source.tags,
    },
  });
}
