import { describe, expect, it } from 'vitest';

import { buildQrPayload, deriveContentLabel, InvalidContentPayloadError } from './contentTypes';

describe('buildQrPayload', () => {
  it('throws for the URL content type', () => {
    expect(() => buildQrPayload('URL', { text: 'x' })).toThrow(InvalidContentPayloadError);
  });

  it('throws when payload is missing', () => {
    expect(() => buildQrPayload('TEXT', null)).toThrow(InvalidContentPayloadError);
  });

  describe('TEXT', () => {
    it('returns the raw text', () => {
      expect(buildQrPayload('TEXT', { text: 'Hello world' })).toBe('Hello world');
    });

    it('throws when text is empty', () => {
      expect(() => buildQrPayload('TEXT', { text: '' })).toThrow(InvalidContentPayloadError);
    });
  });

  describe('VCARD', () => {
    it('builds a valid vCard 3.0 block with all fields', () => {
      const vcard = buildQrPayload('VCARD', {
        name: 'Jane Doe',
        phone: '+1234567890',
        email: 'jane@example.com',
        org: 'Acme',
      });
      expect(vcard).toBe(
        'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nTEL:+1234567890\nEMAIL:jane@example.com\nORG:Acme\nEND:VCARD',
      );
    });

    it('omits optional fields that are not provided', () => {
      const vcard = buildQrPayload('VCARD', { name: 'Jane Doe' });
      expect(vcard).toBe('BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nEND:VCARD');
    });

    it('escapes semicolons and commas in field values', () => {
      const vcard = buildQrPayload('VCARD', { name: 'Doe; Jane, Jr.' });
      expect(vcard).toContain('FN:Doe\\; Jane\\, Jr.');
    });

    it('throws when name is missing', () => {
      expect(() => buildQrPayload('VCARD', {} as never)).toThrow(InvalidContentPayloadError);
    });
  });

  describe('WIFI', () => {
    it('builds a WPA network string with password', () => {
      const wifi = buildQrPayload('WIFI', {
        ssid: 'MyNetwork',
        password: 'secret123',
        security: 'WPA',
      });
      expect(wifi).toBe('WIFI:T:WPA;S:MyNetwork;P:secret123;H:false;;');
    });

    it('defaults security to WPA when not specified', () => {
      const wifi = buildQrPayload('WIFI', { ssid: 'MyNetwork', password: 'secret123' });
      expect(wifi).toContain('T:WPA;');
    });

    it('omits the password field entirely for an open (nopass) network', () => {
      const wifi = buildQrPayload('WIFI', { ssid: 'OpenNet', security: 'nopass' });
      expect(wifi).toBe('WIFI:T:nopass;S:OpenNet;H:false;;');
      expect(wifi).not.toContain('P:');
    });

    it('throws when ssid is missing', () => {
      expect(() => buildQrPayload('WIFI', { password: 'x' } as never)).toThrow(
        InvalidContentPayloadError,
      );
    });
  });
});

describe('deriveContentLabel', () => {
  it('returns an empty string for URL type', () => {
    expect(deriveContentLabel('URL', { text: 'x' })).toBe('');
  });

  it('returns an empty string when payload is missing', () => {
    expect(deriveContentLabel('TEXT', null)).toBe('');
  });

  it('labels TEXT with a truncated preview', () => {
    expect(deriveContentLabel('TEXT', { text: 'Hello' })).toBe('Text: Hello');
  });

  it('labels VCARD with the contact name', () => {
    expect(deriveContentLabel('VCARD', { name: 'Jane Doe' })).toBe('vCard: Jane Doe');
  });

  it('labels WIFI with the SSID', () => {
    expect(deriveContentLabel('WIFI', { ssid: 'MyNetwork' })).toBe('Wi-Fi: MyNetwork');
  });
});
