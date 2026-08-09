import { describe, expect, it } from 'vitest';

import type { QrScanEvent } from '@/generated/prisma/client';

import { CsvParseError, parseQrCsv, scanEventsToCsv } from './csv';

function fakeScanEvent(overrides: Partial<QrScanEvent> = {}): QrScanEvent {
  return {
    id: 'evt-1',
    qrId: 'qr-1',
    shortCode: 'ABC123',
    scanTimestamp: new Date('2026-01-15T10:30:00.000Z'),
    scanMethod: 'QR_SCAN',
    deviceType: 'MOBILE',
    deviceOs: 'iOS',
    browser: 'Safari',
    userAgent: 'test-agent',
    ipAddress: '203.0.113.5',
    locationCity: 'Karachi',
    locationCountry: 'Pakistan',
    locationLatitude: null,
    locationLongitude: null,
    targetUrlAtScan: 'https://example.com',
    ...overrides,
  };
}

describe('parseQrCsv', () => {
  it('parses a minimal CSV with just name and target_url', () => {
    const csv = 'name,target_url\norder-1,https://example.com/1\norder-2,https://example.com/2';
    const entries = parseQrCsv(csv);
    expect(entries).toEqual([
      { qrName: 'order-1', targetUrl: 'https://example.com/1', productType: undefined },
      { qrName: 'order-2', targetUrl: 'https://example.com/2', productType: undefined },
    ]);
  });

  it('expands per-row quantity into a sequenced set of entries', () => {
    const csv = 'name,target_url,quantity\nstand-1,https://example.com,3';
    const entries = parseQrCsv(csv);
    expect(entries.map((e) => e.qrName)).toEqual(['stand-1', 'stand-1-02', 'stand-1-03']);
  });

  it('parses product_type case-insensitively', () => {
    const csv = 'name,target_url,product_type\ncoin-1,https://example.com,coin';
    const entries = parseQrCsv(csv);
    expect(entries[0].productType).toBe('COIN');
  });

  it('is column-order independent', () => {
    const csv = 'target_url,name\nhttps://example.com,order-1';
    const entries = parseQrCsv(csv);
    expect(entries).toEqual([
      { qrName: 'order-1', targetUrl: 'https://example.com', productType: undefined },
    ]);
  });

  it('throws on an empty CSV', () => {
    expect(() => parseQrCsv('')).toThrow(CsvParseError);
  });

  it('throws when a required column is missing', () => {
    expect(() => parseQrCsv('name\norder-1')).toThrow(/target_url/);
  });

  it('throws on a non-positive/non-integer quantity', () => {
    const csv = 'name,target_url,quantity\norder-1,https://example.com,0';
    expect(() => parseQrCsv(csv)).toThrow(/quantity/);
  });

  it('throws on an invalid product_type', () => {
    const csv = 'name,target_url,product_type\norder-1,https://example.com,mug';
    expect(() => parseQrCsv(csv)).toThrow(/product_type/);
  });

  it('throws when a row is missing name or target_url', () => {
    const csv = 'name,target_url\n,https://example.com';
    expect(() => parseQrCsv(csv)).toThrow(/Row 2/);
  });
});

describe('scanEventsToCsv', () => {
  it('writes a header row plus one row per event', () => {
    const csv = scanEventsToCsv([fakeScanEvent()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'scan_timestamp,scan_method,device_type,device_os,browser,location_city,location_country,target_url_at_scan',
    );
    expect(lines[1]).toBe(
      '2026-01-15T10:30:00.000Z,QR_SCAN,MOBILE,iOS,Safari,Karachi,Pakistan,https://example.com',
    );
  });

  it('produces only the header row for an empty list', () => {
    const csv = scanEventsToCsv([]);
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('quotes and escapes fields containing commas or quotes', () => {
    const csv = scanEventsToCsv([fakeScanEvent({ locationCity: 'Say "hi", ok' })]);
    expect(csv).toContain('"Say ""hi"", ok"');
  });

  it('renders null fields as empty', () => {
    const csv = scanEventsToCsv([fakeScanEvent({ locationCity: null, browser: null })]);
    const [, row] = csv.split('\n');
    expect(row.split(',')[4]).toBe(''); // browser
    expect(row.split(',')[5]).toBe(''); // location_city
  });
});
