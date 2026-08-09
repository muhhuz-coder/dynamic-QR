import { describe, expect, it } from 'vitest';

import { applyUtmParams, type OrgUtmDefaults } from './utm';

const defaults: OrgUtmDefaults = {
  defaultUtmSource: 'TapReview',
  defaultUtmMedium: 'qr_code',
  defaultUtmCampaign: '{{name}}',
  defaultUtmTerm: null,
  defaultUtmContent: null,
};

describe('applyUtmParams', () => {
  it('appends configured UTM params to the target URL', () => {
    const result = applyUtmParams('https://example.com/menu', defaults, 'order-501', true);
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('TapReview');
    expect(url.searchParams.get('utm_medium')).toBe('qr_code');
  });

  it('substitutes {{name}} in utm_campaign with the QR name', () => {
    const result = applyUtmParams('https://example.com/menu', defaults, 'order-501', true);
    expect(new URL(result).searchParams.get('utm_campaign')).toBe('order-501');
  });

  it('omits params that are not configured', () => {
    const result = applyUtmParams('https://example.com/menu', defaults, 'order-501', true);
    const url = new URL(result);
    expect(url.searchParams.has('utm_term')).toBe(false);
    expect(url.searchParams.has('utm_content')).toBe(false);
  });

  it('returns the URL unchanged when utmEnabled is false', () => {
    const result = applyUtmParams('https://example.com/menu', defaults, 'order-501', false);
    expect(result).toBe('https://example.com/menu');
  });

  it('returns the URL unchanged when there are no org defaults', () => {
    const result = applyUtmParams('https://example.com/menu', null, 'order-501', true);
    expect(result).toBe('https://example.com/menu');
  });

  it('returns the URL unchanged when no default fields are set', () => {
    const empty: OrgUtmDefaults = {
      defaultUtmSource: null,
      defaultUtmMedium: null,
      defaultUtmCampaign: null,
      defaultUtmTerm: null,
      defaultUtmContent: null,
    };
    const result = applyUtmParams('https://example.com/menu', empty, 'order-501', true);
    expect(result).toBe('https://example.com/menu');
  });

  it('preserves existing query params on the target URL', () => {
    const result = applyUtmParams('https://example.com/menu?ref=abc', defaults, 'order-501', true);
    const url = new URL(result);
    expect(url.searchParams.get('ref')).toBe('abc');
    expect(url.searchParams.get('utm_source')).toBe('TapReview');
  });

  it('does not throw for a malformed target URL, returning it unchanged', () => {
    const result = applyUtmParams('not a url', defaults, 'order-501', true);
    expect(result).toBe('not a url');
  });
});
