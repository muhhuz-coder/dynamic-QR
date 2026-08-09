import type { AuditLog, PrismaClient, QrCode } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';

export interface QrDetail extends QrCode {
  auditLogs: AuditLog[];
}

/** Fetches a QR code plus its target-change audit history, for the admin detail page. */
export async function getQrDetail(db: PrismaClient, qrName: string): Promise<QrDetail> {
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    throw new QrNotFoundError(qrName);
  }

  const auditLogs = await db.auditLog.findMany({
    where: { resourceType: 'QR_CODE', resourceId: qrCode.id },
    orderBy: { timestamp: 'desc' },
  });

  return { ...qrCode, auditLogs };
}
