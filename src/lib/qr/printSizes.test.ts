import { describe, expect, it } from 'vitest';

import { InvalidPrintSizeError, resolveQrSizeMm } from './printSizes';

describe('resolveQrSizeMm', () => {
  it('uses the product-type preset when no custom size is given', () => {
    expect(resolveQrSizeMm('CARD')).toBe(30);
    expect(resolveQrSizeMm('COIN')).toBe(28);
    expect(resolveQrSizeMm('STAND')).toBe(80);
  });

  it('falls back to a generic default when there is no product type', () => {
    expect(resolveQrSizeMm(null)).toBe(40);
  });

  it('lets an explicit custom size override the preset', () => {
    expect(resolveQrSizeMm('CARD', 50)).toBe(50);
    expect(resolveQrSizeMm(null, 15)).toBe(15);
  });

  it('rejects a custom size below the minimum', () => {
    expect(() => resolveQrSizeMm('CARD', 1)).toThrow(InvalidPrintSizeError);
  });

  it('rejects a custom size above the maximum', () => {
    expect(() => resolveQrSizeMm('CARD', 1000)).toThrow(InvalidPrintSizeError);
  });

  it('rejects a non-finite custom size', () => {
    expect(() => resolveQrSizeMm('CARD', NaN)).toThrow(InvalidPrintSizeError);
  });
});
