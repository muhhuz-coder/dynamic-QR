import type { ProductType } from '@/generated/prisma/client';

/**
 * QR square side length (mm) per product type — not the full physical
 * product size, but how big the QR itself should render within it, leaving
 * room for a logo/text/edge margin. Derived from common print conventions:
 *   - CARD: US business card is 89x51mm; a ~30mm QR leaves room for a logo/text.
 *   - COIN: 40mm challenge coin; a 28mm QR clears the coin's curved edge.
 *   - STAND: 4x6in (102x152mm) tent card; an 80mm QR is easily scannable from a table.
 */
export const PRODUCT_QR_SIZE_MM: Record<ProductType, number> = {
  CARD: 30,
  COIN: 28,
  STAND: 80,
};

export const DEFAULT_QR_SIZE_MM = 40;

const MIN_SIZE_MM = 5;
const MAX_SIZE_MM = 500;

export class InvalidPrintSizeError extends Error {
  constructor(sizeMm: number) {
    super(`Size must be between ${MIN_SIZE_MM}mm and ${MAX_SIZE_MM}mm, got ${sizeMm}`);
    this.name = 'InvalidPrintSizeError';
  }
}

/**
 * Resolves the physical QR size to render: an explicit custom override wins,
 * otherwise the product-type convention preset, otherwise a generic default.
 */
export function resolveQrSizeMm(productType: ProductType | null, customSizeMm?: number): number {
  if (customSizeMm !== undefined) {
    if (
      !Number.isFinite(customSizeMm) ||
      customSizeMm < MIN_SIZE_MM ||
      customSizeMm > MAX_SIZE_MM
    ) {
      throw new InvalidPrintSizeError(customSizeMm);
    }
    return customSizeMm;
  }

  if (productType && productType in PRODUCT_QR_SIZE_MM) {
    return PRODUCT_QR_SIZE_MM[productType];
  }

  return DEFAULT_QR_SIZE_MM;
}
