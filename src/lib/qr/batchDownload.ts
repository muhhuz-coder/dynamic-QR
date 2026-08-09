import JSZip from 'jszip';

import type { PrismaClient, QrCode } from '@/generated/prisma/client';

import { buildShortLinkUrl, generateQrSvg, type QrDesignOptions } from './image';
import { resolveQrSizeMm } from './printSizes';

export class BatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Batch not found: ${batchId}`);
    this.name = 'BatchNotFoundError';
  }
}

export class NoQrCodesFoundError extends Error {
  constructor() {
    super('No matching QR codes found');
    this.name = 'NoQrCodesFoundError';
  }
}

/**
 * Zips one print-ready SVG per QR code, named by qrName. Each SVG is
 * physically sized per that QR's own productType convention (see
 * printSizes.ts) — a mixed selection can include coins, cards, and stands.
 */
async function buildSvgZip(qrCodes: QrCode[], baseUrl: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const qrCode of qrCodes) {
    const sizeMm = resolveQrSizeMm(qrCode.productType);
    const designOptions = qrCode.designOptions as QrDesignOptions | null;
    const svg = await generateQrSvg(buildShortLinkUrl(baseUrl, qrCode.shortCode), {
      ...designOptions,
      sizeMm,
    });
    zip.file(`${qrCode.qrName}.svg`, svg);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** All QR codes in a single batch — used by the per-batch "Download batch" button. */
export async function buildBatchSvgZip(
  db: PrismaClient,
  batchId: string,
  baseUrl: string,
): Promise<Buffer> {
  const qrCodes = await db.qrCode.findMany({ where: { batchId } });
  if (qrCodes.length === 0) {
    throw new BatchNotFoundError(batchId);
  }
  return buildSvgZip(qrCodes, baseUrl);
}

/** An arbitrary, cross-batch selection — used by the dashboard's multi-select "Download selected". */
export async function buildQrCodesSvgZip(
  db: PrismaClient,
  qrNames: string[],
  baseUrl: string,
): Promise<Buffer> {
  const qrCodes = await db.qrCode.findMany({ where: { qrName: { in: qrNames } } });
  if (qrCodes.length === 0) {
    throw new NoQrCodesFoundError();
  }
  return buildSvgZip(qrCodes, baseUrl);
}
