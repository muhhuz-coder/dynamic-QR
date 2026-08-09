import type { PrismaClient, ProductType } from '@/generated/prisma/client';

import { generateQRNames } from './naming';
import { generateUniqueShortCode } from './shortCode';
import { isValidRedirectUrl } from './validation';

// Caps request size so a single bulk-create/import can't lock up the DB or blow
// past a reasonable request body/transaction size. Admin-only endpoint, but still
// bounded per docs/GUARDRAILS.md (bulk-import endpoints must be rate/size-limited).
export const MAX_BATCH_SIZE = 500;

export interface BatchQrInput {
  qrName: string;
  targetUrl: string;
  productType?: ProductType;
}

export interface CreatedQrSummary {
  id: string;
  qrName: string;
  shortCode: string;
  targetUrl: string;
  productType: ProductType | null;
}

export interface BatchCreateResult {
  batchId: string;
  batchName: string;
  totalCreated: number;
  qrs: CreatedQrSummary[];
}

export class BatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchValidationError';
  }
}

export class DuplicateQrNamesError extends BatchValidationError {
  constructor(public readonly names: string[]) {
    super(`Duplicate QR names found: ${names.join(', ')}`);
    this.name = 'DuplicateQrNamesError';
  }
}

export class InvalidTargetUrlError extends BatchValidationError {
  constructor(public readonly urls: string[]) {
    super(`Invalid target URL(s): ${urls.join(', ')}`);
    this.name = 'InvalidTargetUrlError';
  }
}

export function generateBatchId(): string {
  return `batch-qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Expands a single "baseName + quantity" bulk-create request into individual entries. */
export function buildBatchEntriesFromBaseName(
  baseName: string,
  quantity: number,
  targetUrl: string,
  productType?: ProductType,
): BatchQrInput[] {
  return generateQRNames(baseName, quantity).map((qrName) => ({
    qrName,
    targetUrl,
    productType,
  }));
}

/**
 * Validates and inserts a batch of QR codes in a single transaction.
 * Mirrors processBatchQRs() from docs/core-logic/02-qr-management.md, with two
 * deliberate fixes: URL validation before insert (open-redirect gap), and a
 * bounded batch size instead of an unbounded array.
 *
 * QR image generation is on-demand (see src/lib/qr/image.ts + the image route),
 * not pre-rendered/uploaded to object storage — no storage provider is wired up
 * for this slice, and the short code is all a renderer needs.
 */
export async function createQrBatch(
  db: PrismaClient,
  entries: BatchQrInput[],
  batchName: string,
): Promise<BatchCreateResult> {
  if (entries.length === 0) {
    throw new BatchValidationError('Batch must contain at least one QR code');
  }
  if (entries.length > MAX_BATCH_SIZE) {
    throw new BatchValidationError(`Batch exceeds the maximum size of ${MAX_BATCH_SIZE}`);
  }

  const invalidUrls = [
    ...new Set(entries.filter((e) => !isValidRedirectUrl(e.targetUrl)).map((e) => e.targetUrl)),
  ];
  if (invalidUrls.length > 0) {
    throw new InvalidTargetUrlError(invalidUrls);
  }

  const namesInRequest = entries.map((e) => e.qrName);
  const duplicatesWithinRequest = namesInRequest.filter(
    (name, i) => namesInRequest.indexOf(name) !== i,
  );

  const existing = await db.qrCode.findMany({
    where: { qrName: { in: namesInRequest } },
    select: { qrName: true },
  });
  const duplicates = [...new Set([...duplicatesWithinRequest, ...existing.map((e) => e.qrName)])];
  if (duplicates.length > 0) {
    throw new DuplicateQrNamesError(duplicates);
  }

  const batchId = generateBatchId();

  // Sequential, not Promise.all: generateUniqueShortCode only checks the DB, so
  // concurrent generation within this same batch could hand out the same code to
  // two entries before either is inserted. codesUsedInThisBatch closes that gap.
  const codesUsedInThisBatch = new Set<string>();
  const withShortCodes: (BatchQrInput & { shortCode: string })[] = [];
  for (const entry of entries) {
    const shortCode = await generateUniqueShortCode(async (code) => {
      if (codesUsedInThisBatch.has(code)) return true;
      return (await db.qrCode.findUnique({ where: { shortCode: code } })) !== null;
    });
    codesUsedInThisBatch.add(shortCode);
    withShortCodes.push({ ...entry, shortCode });
  }

  const created = await db.$transaction(
    withShortCodes.map((entry) =>
      db.qrCode.create({
        data: {
          qrName: entry.qrName,
          shortCode: entry.shortCode,
          targetUrl: entry.targetUrl,
          productType: entry.productType,
          batchId,
          batchName,
        },
      }),
    ),
  );

  return {
    batchId,
    batchName,
    totalCreated: created.length,
    qrs: created.map((qr) => ({
      id: qr.id,
      qrName: qr.qrName,
      shortCode: qr.shortCode,
      targetUrl: qr.targetUrl,
      productType: qr.productType,
    })),
  };
}
