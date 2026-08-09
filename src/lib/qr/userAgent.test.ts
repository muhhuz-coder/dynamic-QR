import { describe, expect, it } from 'vitest';

import { parseBrowser, parseDeviceType, parseOS } from './userAgent';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/118.0',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36 Edg/117.0',
};

describe('parseDeviceType', () => {
  it('classifies iPad as tablet, not mobile', () => {
    // Real iPad Safari UAs contain the "Mobile" token, which is why this is
    // an explicit regression test — a naive mobile-first check misclassifies it.
    expect(parseDeviceType(UA.ipadSafari)).toBe('tablet');
  });

  it('classifies iPhone/Android phones as mobile', () => {
    expect(parseDeviceType(UA.iphoneSafari)).toBe('mobile');
    expect(parseDeviceType(UA.androidChrome)).toBe('mobile');
  });

  it('classifies desktop browsers as desktop', () => {
    expect(parseDeviceType(UA.windowsChrome)).toBe('desktop');
    expect(parseDeviceType(UA.macFirefox)).toBe('desktop');
  });
});

describe('parseOS', () => {
  it('detects iOS, Android, Windows, macOS', () => {
    expect(parseOS(UA.iphoneSafari)).toBe('iOS');
    expect(parseOS(UA.androidChrome)).toBe('Android');
    expect(parseOS(UA.windowsChrome)).toBe('Windows');
    expect(parseOS(UA.macFirefox)).toBe('macOS');
  });
});

describe('parseBrowser', () => {
  it('detects Edge before Chrome (Edge UA contains both tokens)', () => {
    expect(parseBrowser(UA.windowsEdge)).toBe('Edge');
  });

  it('detects Chrome, Firefox, Safari', () => {
    expect(parseBrowser(UA.windowsChrome)).toBe('Chrome');
    expect(parseBrowser(UA.macFirefox)).toBe('Firefox');
  });

  it('detects mobile Safari as Safari, not Chrome', () => {
    expect(parseBrowser(UA.iphoneSafari)).toBe('Safari');
  });
});
