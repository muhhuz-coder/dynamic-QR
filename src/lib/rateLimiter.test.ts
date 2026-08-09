import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the max token count', () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
  });

  it('tracks buckets independently per key', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('b')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
  });

  it('refills tokens after the interval elapses', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(limiter.tryConsume('a')).toBe(true);
  });
});
