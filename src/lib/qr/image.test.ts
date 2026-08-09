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

describe('generateQrSvg — custom render (shape/frame/text/gradient)', () => {
  it('stays on the fast path (uses <path>) when only fgColor/bgColor/logoUrl are set', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { fgColor: '#2563eb' });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<rect x="0" y="0"');
  });

  it('renders dot-shaped modules as circles instead of a single path', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { moduleShape: 'dots' });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('<circle');
  });

  it('renders rounded modules as rects with a border radius', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { moduleShape: 'rounded' });
    expect(svg).toMatch(/<rect[^>]*rx="/);
  });

  it('renders diamond modules as polygons', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { moduleShape: 'diamond' });
    expect(svg).toContain('<polygon');
  });

  it('renders circular finder-pattern eyes when eyeShape is circle', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', { eyeShape: 'circle' });
    expect(svg).toContain('<circle');
  });

  it('applies a linear gradient fill instead of a flat fgColor', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      gradient: { from: '#2563eb', to: '#f97316', direction: 'horizontal' },
    });
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('stop-color="#2563eb"');
    expect(svg).toContain('stop-color="#f97316"');
    expect(svg).toContain('fill="url(#qrFill)"');
  });

  it('tiles a background image via a pattern fill', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      bgImageUrl: 'https://example.com/bg.png',
    });
    expect(svg).toContain('<pattern');
    expect(svg).toContain('<image href="https://example.com/bg.png"');
  });

  it('draws a decorative frame border, larger than the bare QR canvas', async () => {
    const bare = await generateQrSvg('https://tap.pk/qr/ABC12345');
    const framed = await generateQrSvg('https://tap.pk/qr/ABC12345', { frame: 'rounded' });
    const width = (svg: string) => Number(svg.match(/viewBox="0 0 ([\d.]+)/)?.[1]);
    expect(framed).toContain('<rect');
    expect(framed).toMatch(/stroke="#000000"/);
    expect(width(framed)).toBeGreaterThan(width(bare));
  });

  it('adds a "SCAN ME" caption bar for the scan-me frame style, using a custom frameText if given', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      frame: 'scan-me',
      frameText: 'TAP HERE',
    });
    expect(svg).toContain('TAP HERE');
  });

  it('renders header and footer text above/below the QR', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      headerText: 'Order #12345',
      footerText: 'Thank you!',
    });
    expect(svg).toContain('Order #12345');
    expect(svg).toContain('Thank you!');
  });

  it('escapes XML-unsafe characters in header/footer/frame text', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      headerText: '<script>&"quote"',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;quote&quot;');
  });

  it('still embeds a logo when combined with a custom-render option', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      moduleShape: 'dots',
      logoUrl: 'https://example.com/logo.png',
    });
    expect(svg).toContain('<image href="https://example.com/logo.png"');
  });

  it('still applies physical sizing (mm) to a custom-rendered SVG', async () => {
    const svg = await generateQrSvg('https://tap.pk/qr/ABC12345', {
      moduleShape: 'dots',
      sizeMm: 40,
    });
    expect(svg).toContain('width="40mm"');
    expect(svg).toContain('height="40mm"');
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
