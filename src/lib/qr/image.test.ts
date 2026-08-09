import { describe, expect, it } from 'vitest';

import { buildShortLinkUrl, generateQrPng, generateQrSvg } from './image';

describe('buildShortLinkUrl', () => {
  it('joins base URL and short code with a single slash', () => {
    expect(buildShortLinkUrl('http://localhost:3000', 'ABC12345')).toBe(
      'http://localhost:3000/qr/ABC12345',
    );
  });

  it('strips a trailing slash on the base URL', () => {
    expect(buildShortLinkUrl('https://tap.pk/', 'ABC12345')).toBe('https://tap.pk/qr/ABC12345');
  });
});

describe('generateQrPng', () => {
  it('produces a non-empty PNG buffer', async () => {
    const buffer = await generateQrPng('https://tap.pk/qr/ABC12345');
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});

describe('generateQrSvg', () => {
  it('produces an SVG document containing a viewBox and path', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
    expect(svg).toContain('<path');
  });

  it('renders no background fill — black modules on nothing, print-ready for any substrate', async () => {
    // Regression guard: the qrcode library renders a solid white `<path fill=...>`
    // background whenever color.light's alpha isn't exactly 0 — including when
    // no `color` option is passed at all. generateQrSvg must pass an explicit
    // transparent light color, not just omit the option.
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345');
    expect(svg).not.toContain('fill="#ffffff"');
    expect(svg).not.toContain('<rect');
  });

  it('defaults to pixel-based width/height when no physical size is given', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345');
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).not.toMatch(/width="[\d.]+mm"/);
  });

  it('sets width/height to the given physical size in millimeters', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', 30);
    expect(svg).toContain('width="30mm"');
    expect(svg).toContain('height="30mm"');
  });

  it('leaves the viewBox (module grid) unchanged by physical sizing', async () => {
    const withoutSize = await generateQrSvg('https://tap.pk/qr/ABC12345');
    const withSize = await generateQrSvg('https://tap.pk/qr/ABC12345', 30);
    const viewBox = (svg: string) => svg.match(/viewBox="[^"]+"/)?.[0];
    expect(viewBox(withSize)).toBe(viewBox(withoutSize));
  });

  it('accepts an options object (new call shape) alongside the legacy bare-number sizeMm', async () => {
    const viaOptions = await generateQrSvg('https://tap.pk/qr/ABC12345', { sizeMm: 30 });
    const viaLegacy = await generateQrSvg('https://tap.pk/qr/ABC12345', 30);
    expect(viaOptions).toContain('width="30mm"');
    expect(viaLegacy).toContain('width="30mm"');
  });

  it('uses a custom fgColor for the module stroke', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { fgColor: '#2563eb' });
    expect(svg).toContain('stroke="#2563eb"');
  });

  it('renders a solid background when bgColor is set, instead of transparent', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { bgColor: '#ffffff' });
    expect(svg).toContain('fill="#ffffff"');
  });

  it('embeds a centered logo image and bumps error correction to H when logoUrl is set', async () => {
    const withoutLogo = await generateQrSvg('https://tap.pk/qr/ABC12345');
    const withLogo = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      logoUrl: 'https://example.com/logo.png',
    });

    expect(withLogo).toContain('<image href="https://example.com/logo.png"');
    // Higher error correction means more modules for the same data, so the
    // module grid (viewBox) should be at least as large.
    const viewBoxSize = (svg: string) => Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
    expect(viewBoxSize(withLogo)).toBeGreaterThanOrEqual(viewBoxSize(withoutLogo));
  });
});

describe('generateQrPng with design options', () => {
  it('produces a different buffer when fgColor/bgColor are customized', async () => {
    const defaultPng = await generateQrPng('https://tap.pk/qr/ABC12345');
    const customPng = await generateQrPng('https://tap.pk/qr/ABC12345', {
      fgColor: '#2563eb',
      bgColor: '#f1f5f9',
    });
    expect(customPng.equals(defaultPng)).toBe(false);
  });
});
