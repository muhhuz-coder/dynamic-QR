import type { PrismaClient } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';
import { InvalidTargetUrlError } from './batch';
import { isValidRedirectUrl } from './validation';

export interface UpdateTargetResult {
  qrName: string;
  oldTarget: string;
  newTarget: string;
}

/**
 * Updates a QR's redirect target and records the change in the audit log.
 * Mirrors updateQRTarget() from docs/core-logic/02-qr-management.md, with the
 * URL-validation fix from docs/GUARDRAILS.md (http/https only).
 */
export async function updateQrTarget(
  db: PrismaClient,
  qrName: string,
  newTargetUrl: string,
  adminId: string | null,
): Promise<UpdateTargetResult> {
  if (!isValidRedirectUrl(newTargetUrl)) {
    throw new InvalidTargetUrlError([newTargetUrl]);
  }

  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    throw new QrNotFoundError(qrName);
  }

  const oldTarget = qrCode.targetUrl;

  await db.$transaction([
    db.qrCode.update({
      where: { id: qrCode.id },
      data: { targetUrl: newTargetUrl, targetUrlUpdatedAt: new Date() },
    }),
    db.auditLog.create({
      data: {
        adminId,
        action: 'UPDATE_QR_TARGET',
        resourceType: 'QR_CODE',
        resourceId: qrCode.id,
        oldValue: oldTarget,
        newValue: newTargetUrl,
      },
    }),
  ]);

  return { qrName, oldTarget, newTarget: newTargetUrl };
}
