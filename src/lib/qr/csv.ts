import type { ProductType, QrScanEvent } from '@/generated/prisma/client';

import { buildBatchEntriesFromBaseName, type BatchQrInput } from './batch';

const REQUIRED_COLUMNS = ['name', 'target_url'] as const;
const VALID_PRODUCT_TYPES = new Set<ProductType>(['STAND', 'COIN', 'CARD']);

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parses a bulk-import CSV (columns: name, target_url, quantity?, product_type?)
 * and expands each row's quantity into individual QR entries via
 * generateQRNames — mirrors the "batch create" flow but sourced from a file
 * instead of a single base name + quantity form field.
 */
export function parseQrCsv(csvText: string): BatchQrInput[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new CsvParseError('CSV is empty');
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!header.includes(required)) {
      throw new CsvParseError(`Missing required column: ${required}`);
    }
  }

  const nameIdx = header.indexOf('name');
  const urlIdx = header.indexOf('target_url');
  const quantityIdx = header.indexOf('quantity');
  const productTypeIdx = header.indexOf('product_type');

  const entries: BatchQrInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const rowNumber = i + 1;

    const name = cells[nameIdx];
    const targetUrl = cells[urlIdx];
    if (!name || !targetUrl) {
      throw new CsvParseError(`Row ${rowNumber}: name and target_url are required`);
    }

    let quantity = 1;
    if (quantityIdx !== -1 && cells[quantityIdx]) {
      quantity = Number(cells[quantityIdx]);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new CsvParseError(`Row ${rowNumber}: quantity must be a positive integer`);
      }
    }

    let productType: ProductType | undefined;
    if (productTypeIdx !== -1 && cells[productTypeIdx]) {
      const raw = cells[productTypeIdx].toUpperCase() as ProductType;
      if (!VALID_PRODUCT_TYPES.has(raw)) {
        throw new CsvParseError(
          `Row ${rowNumber}: invalid product_type "${cells[productTypeIdx]}"`,
        );
      }
      productType = raw;
    }

    entries.push(...buildBatchEntriesFromBaseName(name, quantity, targetUrl, productType));
  }

  return entries;
}

const SCAN_EVENT_CSV_COLUMNS = [
  'scan_timestamp',
  'scan_method',
  'device_type',
  'device_os',
  'browser',
  'location_city',
  'location_country',
  'target_url_at_scan',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

/** Raw scan-log export — the inverse of parseQrCsv(), for the "download scan data" action. */
export function scanEventsToCsv(events: QrScanEvent[]): string {
  const header = SCAN_EVENT_CSV_COLUMNS.join(',');
  const rows = events.map((event) =>
    [
      event.scanTimestamp.toISOString(),
      event.scanMethod,
      event.deviceType,
      event.deviceOs,
      event.browser,
      event.locationCity,
      event.locationCountry,
      event.targetUrlAtScan,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n');
}
