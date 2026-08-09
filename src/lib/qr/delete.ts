import type { PrismaClient } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';

/** Deletes a QR code and its scan history. */
export async function deleteQrCode(db: PrismaClient, qrName: string): Promise<void> {
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    throw new QrNotFoundError(qrName);
  }

  await db.qrScanEvent.deleteMany({ where: { qrId: qrCode.id } });
  await db.qrCode.delete({ where: { id: qrCode.id } });
}

/** Bulk delete by name — used by the dashboard's multi-select bulk action. Silently skips unknown names. */
export async function deleteQrCodes(
  db: PrismaClient,
  qrNames: string[],
): Promise<{ deletedCount: number }> {
  const qrCodes = await db.qrCode.findMany({ where: { qrName: { in: qrNames } } });
  const ids = qrCodes.map((q) => q.id);

  await db.qrScanEvent.deleteMany({ where: { qrId: { in: ids } } });
  const result = await db.qrCode.deleteMany({ where: { id: { in: ids } } });

  return { deletedCount: result.count };
}
