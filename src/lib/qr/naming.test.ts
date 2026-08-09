import { describe, expect, it } from 'vitest';

import { generateQRNames } from './naming';

describe('generateQRNames', () => {
  it('returns just the base name when quantity is 1', () => {
    expect(generateQRNames('order-12345', 1)).toEqual(['order-12345']);
  });

  it('appends zero-padded sequence numbers starting at 02', () => {
    expect(generateQRNames('order-12345', 3)).toEqual([
      'order-12345',
      'order-12345-02',
      'order-12345-03',
    ]);
  });

  it('pads to two digits for quantities up to 10', () => {
    const names = generateQRNames('order-12345', 10);
    expect(names).toHaveLength(10);
    expect(names[9]).toBe('order-12345-10');
  });

  it('throws for quantity less than 1', () => {
    expect(() => generateQRNames('order-12345', 0)).toThrow();
  });
});
