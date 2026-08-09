import type { PrismaClient, QrCode } from '@/generated/prisma/client';

const MAX_LIST_RESULTS = 200;

export interface ListQrCodesOptions {
  batchId?: string;
}

/** Lists QR codes newest-first, optionally scoped to a batch. Powers the admin dashboard table. */
export async function listQrCodes(
  db: PrismaClient,
  options: ListQrCodesOptions = {},
): Promise<QrCode[]> {
  return db.qrCode.findMany({
    where: options.batchId ? { batchId: options.batchId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST_RESULTS,
  });
}
