import { describe, expect, it } from 'vitest';

import { isValidRedirectUrl } from './validation';

describe('isValidRedirectUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidRedirectUrl('https://pizzahub.com')).toBe(true);
    expect(isValidRedirectUrl('http://example.com/menu')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isValidRedirectUrl('not a url')).toBe(false);
    expect(isValidRedirectUrl('')).toBe(false);
  });

  it('rejects javascript: URIs (stored XSS vector)', () => {
    expect(isValidRedirectUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URIs', () => {
    expect(isValidRedirectUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects file: URIs', () => {
    expect(isValidRedirectUrl('file:///etc/passwd')).toBe(false);
  });
});
