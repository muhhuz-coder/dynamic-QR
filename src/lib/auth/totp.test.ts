import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Independent reference TOTP implementation (RFC 6238), used only to cross-check verifyTotpCode. */
function referenceDecodeBase32(secret: string): Buffer {
  let bits = '';
  for (const char of secret.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function referenceComputeCode(secret: string, epochSeconds: number): string {
  const counter = Math.floor(epochSeconds / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const key = referenceDecodeBase32(secret);
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 1_000_000).padStart(6, '0');
}

describe('generateTotpSecret', () => {
  it('produces a base32 string (A-Z, 2-7 only)', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it('produces a different secret each time', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('buildOtpAuthUri', () => {
  it('builds a valid otpauth:// URI containing the secret and account email', () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, 'admin@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(decodeURIComponent(uri)).toContain('admin@example.com');
  });
});

describe('verifyTotpCode', () => {
  it('rejects a non-6-digit code immediately', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '123')).toBe(false);
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
  });

  it('accepts the code an independent reference implementation computes for the same instant', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-01-01T00:00:00Z');
    const expectedCode = referenceComputeCode(secret, Math.floor(now.getTime() / 1000));
    expect(verifyTotpCode(secret, expectedCode, now)).toBe(true);
  });

  it('accepts a code from one step (30s) in the past or future — clock-drift tolerance', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-01-01T00:00:00Z');
    const oneStepEarlier = referenceComputeCode(secret, Math.floor(now.getTime() / 1000) - 30);
    const oneStepLater = referenceComputeCode(secret, Math.floor(now.getTime() / 1000) + 30);
    expect(verifyTotpCode(secret, oneStepEarlier, now)).toBe(true);
    expect(verifyTotpCode(secret, oneStepLater, now)).toBe(true);
  });

  it('rejects a code from two steps (60s) away — outside the tolerance window', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-01-01T00:00:00Z');
    const twoStepsLater = referenceComputeCode(secret, Math.floor(now.getTime() / 1000) + 60);
    // Only assert rejection if the far-away code genuinely differs from anything
    // in the accepted window, avoiding a false failure on a rare collision.
    const acceptedCodes = [-30, 0, 30].map((offset) =>
      referenceComputeCode(secret, Math.floor(now.getTime() / 1000) + offset),
    );
    if (!acceptedCodes.includes(twoStepsLater)) {
      expect(verifyTotpCode(secret, twoStepsLater, now)).toBe(false);
    }
  });

  it('rejects a code generated with a different secret', () => {
    const secret = generateTotpSecret();
    const otherSecret = generateTotpSecret();
    const now = new Date('2026-01-01T00:00:00Z');
    const codeForOtherSecret = referenceComputeCode(otherSecret, Math.floor(now.getTime() / 1000));
    // Guard against the astronomically unlikely case the two 6-digit codes collide.
    const actualCode = referenceComputeCode(secret, Math.floor(now.getTime() / 1000));
    if (codeForOtherSecret !== actualCode) {
      expect(verifyTotpCode(secret, codeForOtherSecret, now)).toBe(false);
    }
  });
});
