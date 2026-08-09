import { describe, expect, it } from 'vitest';

import { calculateDateRange } from './analytics';

describe('calculateDateRange', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('returns a 7-day window', () => {
    const { start, end } = calculateDateRange('7d', now);
    expect(end).toEqual(now);
    expect(start).toEqual(new Date('2026-07-31T12:00:00Z'));
  });

  it('returns a 30-day window', () => {
    const { start } = calculateDateRange('30d', now);
    expect(start).toEqual(new Date('2026-07-08T12:00:00Z'));
  });

  it('returns a 90-day window', () => {
    const { start } = calculateDateRange('90d', now);
    expect(start).toEqual(new Date('2026-05-09T12:00:00Z'));
  });

  it('returns the epoch as the start for "all"', () => {
    const { start, end } = calculateDateRange('all', now);
    expect(start).toEqual(new Date(0));
    expect(end).toEqual(now);
  });
});
