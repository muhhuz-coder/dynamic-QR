import QRCode from 'qrcode';

const BASE_QR_OPTIONS = {
  margin: 2,
  width: 512,
};

export interface QrDesignOptions {
  /** Physical print size in mm — sets the SVG's intrinsic width/height, see withPhysicalSize(). */
  sizeMm?: number;
  /** Module (dark) color as a hex string, e.g. "#2563eb". Defaults to black. */
  fgColor?: string;
  /** Background color as a hex string. Defaults to transparent (PNG) — see the note on generateQrSvg. */
  bgColor?: string;
  /** A logo image URL to overlay at the center. Bumps error correction to 'H' to tolerate the added noise. */
  logoUrl?: string;
}

/** Builds the full short-link URL a printed QR/NFC actually encodes. */
export function buildShortLinkUrl(baseUrl: string, shortCode: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/qr/${shortCode}`;
}

function colorOption(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  // The `qrcode` library wants 8-digit hex (RGBA) — assume full opacity if the
  // caller passed a plain 6-digit color.
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}ff` : hex;
}

export function generateQrPng(url: string, options?: QrDesignOptions): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    ...BASE_QR_OPTIONS,
    type: 'png',
    errorCorrectionLevel: options?.logoUrl ? 'H' : 'M',
    color: {
      dark: colorOption(options?.fgColor, '#000000ff'),
      light: colorOption(options?.bgColor, '#ffffffff'),
    },
  });
}

/**
 * Sets the SVG's intrinsic width/height to a physical size in millimeters
 * instead of a bare pixel number, so design/print software (Illustrator,
 * Inkscape, CorelDraw) places it at the correct real-world size on import —
 * no DPI math needed. The viewBox (module grid) is untouched, so this only
 * changes how big the vector renders, not its internal coordinate system.
 */
function withPhysicalSize(svg: string, sizeMm: number): string {
  return svg
    .replace(/width="\d+(\.\d+)?"/, `width="${sizeMm}mm"`)
    .replace(/height="\d+(\.\d+)?"/, `height="${sizeMm}mm"`);
}

/** Embeds a centered logo `<image>`, sized to ~20% of the viewBox, just before the closing tag. */
function withLogo(svg: string, logoUrl: string): string {
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBoxMatch) return svg;

  const [, widthStr, heightStr] = viewBoxMatch;
  const viewWidth = Number(widthStr);
  const viewHeight = Number(heightStr);
  const logoSize = Math.round(Math.min(viewWidth, viewHeight) * 0.2);
  const x = Math.round((viewWidth - logoSize) / 2);
  const y = Math.round((viewHeight - logoSize) / 2);

  const logoTag = `<image href="${logoUrl}" x="${x}" y="${y}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid slice" />`;
  return svg.replace('</svg>', `${logoTag}</svg>`);
}

/**
 * Black modules on a transparent background by default — print-ready for any
 * substrate color. Note: the `qrcode` library only omits its background
 * element (for a bare no-color-option call) when it's the SVG type — for PNG,
 * `color.light`'s alpha channel must be exactly 0, which colorOption()
 * defaults to for bgColor when unset.
 *
 * Module shape (rounded/dot) isn't supported — the `qrcode` library only
 * renders square modules. Documented as a known gap, not silently ignored.
 */
export async function generateQrSvg(
  url: string,
  options?: QrDesignOptions | number,
): Promise<string> {
  // Backwards-compatible with the old `generateQrSvg(url, sizeMm)` call shape.
  const opts: QrDesignOptions = typeof options === 'number' ? { sizeMm: options } : (options ?? {});

  let svg = await QRCode.toString(url, {
    ...BASE_QR_OPTIONS,
    type: 'svg',
    errorCorrectionLevel: opts.logoUrl ? 'H' : 'M',
    color: {
      dark: colorOption(opts.fgColor, '#000000ff'),
      light: opts.bgColor ? colorOption(opts.bgColor, '#ffffffff') : '#00000000',
    },
  });

  if (opts.logoUrl) {
    svg = withLogo(svg, opts.logoUrl);
  }
  if (opts.sizeMm !== undefined) {
    svg = withPhysicalSize(svg, opts.sizeMm);
  }
  return svg;
}
