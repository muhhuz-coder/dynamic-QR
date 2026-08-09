import { describe, expect, it, vi } from 'vitest';

import { generateUniqueShortCode, randomShortCode } from './shortCode';

describe('randomShortCode', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = randomShortCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe('generateUniqueShortCode', () => {
  it('returns the first candidate when it does not collide', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    const code = await generateUniqueShortCode(exists);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('retries on collision until a free code is found', async () => {
    const exists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const code = await generateUniqueShortCode(exists);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(exists).toHaveBeenCalledTimes(3);
  });

  it('gives up after the max attempts instead of looping forever', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    await expect(generateUniqueShortCode(exists)).rejects.toThrow(/unique short code/i);
  });
});
