import { describe, expect, it } from 'vitest';

import { validateCreateForm } from './createFormValidation';

const valid = { baseName: 'order-1', quantity: '3', targetUrl: 'https://example.com' };

describe('validateCreateForm', () => {
  it('accepts a valid form', () => {
    expect(validateCreateForm(valid)).toBeNull();
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateCreateForm({ ...valid, baseName: '' })).toMatch(/name/i);
    expect(validateCreateForm({ ...valid, baseName: '   ' })).toMatch(/name/i);
  });

  it('rejects a name over 50 characters', () => {
    expect(validateCreateForm({ ...valid, baseName: 'a'.repeat(51) })).toMatch(/50 characters/);
  });

  it('rejects a non-integer quantity', () => {
    expect(validateCreateForm({ ...valid, quantity: '2.5' })).toMatch(/quantity/i);
  });

  it('rejects a quantity below 1', () => {
    expect(validateCreateForm({ ...valid, quantity: '0' })).toMatch(/quantity/i);
  });

  it('rejects a quantity above 100', () => {
    expect(validateCreateForm({ ...valid, quantity: '101' })).toMatch(/quantity/i);
  });

  it('rejects an empty target URL', () => {
    expect(validateCreateForm({ ...valid, targetUrl: '' })).toMatch(/target url/i);
  });
});
