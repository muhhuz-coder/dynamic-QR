import { beforeEach, describe, expect, it } from 'vitest';

import { signAdminToken, verifyAdminToken } from './jwt';

describe('admin JWT', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  });

  it('round-trips a signed token', async () => {
    const token = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
    const payload = await verifyAdminToken(token);
    expect(payload).toEqual({ sub: 'admin-1', email: 'admin@example.com', role: 'admin' });
  });

  it('rejects a tampered token', async () => {
    const token = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
    expect(await verifyAdminToken(tampered)).toBeNull();
  });

  it('rejects garbage input instead of throwing', async () => {
    expect(await verifyAdminToken('not-a-jwt')).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
    process.env.JWT_SECRET = 'a-completely-different-secret';
    expect(await verifyAdminToken(token)).toBeNull();
  });
});
