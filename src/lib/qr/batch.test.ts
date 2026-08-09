import { describe, expect, it } from 'vitest';

import { buildBatchEntriesFromBaseName, generateBatchId } from './batch';

describe('generateBatchId', () => {
  it('produces unique-looking ids with the expected prefix', () => {
    const a = generateBatchId();
    const b = generateBatchId();
    expect(a).toMatch(/^batch-qr-\d+-[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe('buildBatchEntriesFromBaseName', () => {
  it('expands quantity into individually-named entries sharing the target URL', () => {
    const entries = buildBatchEntriesFromBaseName('order-1', 3, 'https://example.com');
    expect(entries).toEqual([
      { qrName: 'order-1', targetUrl: 'https://example.com', productType: undefined },
      { qrName: 'order-1-02', targetUrl: 'https://example.com', productType: undefined },
      { qrName: 'order-1-03', targetUrl: 'https://example.com', productType: undefined },
    ]);
  });

  it('carries the product type through to every entry', () => {
    const entries = buildBatchEntriesFromBaseName('coin-1', 2, 'https://example.com', 'COIN');
    expect(entries.every((e) => e.productType === 'COIN')).toBe(true);
  });
});
