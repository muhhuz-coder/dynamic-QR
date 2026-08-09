import { createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;
/** Tolerance for clock drift between server and the authenticator app. */
const WINDOW_STEPS = 1;

function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return output;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replaceAll(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
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

/** A random 160-bit (20-byte) shared secret, base32-encoded per RFC 6238/4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** `otpauth://` URI for rendering as a QR code in an authenticator app. */
export function buildOtpAuthUri(
  secret: string,
  accountEmail: string,
  issuer = 'Tap & Review',
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function computeCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, '0');
}

/** Verifies a 6-digit code, tolerating one step of clock drift in either direction. */
export function verifyTotpCode(secret: string, code: string, now: Date = new Date()): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const currentCounter = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  for (let delta = -WINDOW_STEPS; delta <= WINDOW_STEPS; delta++) {
    if (computeCode(secret, currentCounter + delta) === code) {
      return true;
    }
  }
  return false;
}
