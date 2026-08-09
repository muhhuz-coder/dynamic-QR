import QRCode from 'qrcode';

const BASE_QR_OPTIONS = {
  margin: 2,
  width: 512,
};

/** One logical module cell, in the custom SVG renderer's internal grid units. */
const UNIT = 10;

export type ModuleShape = 'square' | 'rounded' | 'dots' | 'diamond';
export type EyeShape = 'square' | 'rounded' | 'circle';
export type FrameStyle = 'none' | 'square' | 'rounded' | 'scan-me';

export interface QrGradient {
  from: string;
  to: string;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
}

export interface QrDesignOptions {
  /** Physical print size in mm — sets the SVG's intrinsic width/height, see withPhysicalSize(). */
  sizeMm?: number;
  /** Module (dark) color as a hex string, e.g. "#2563eb". Defaults to black. Ignored if `gradient` is set. */
  fgColor?: string;
  /** Background color as a hex string. Defaults to transparent (PNG) — see the note on generateQrSvg. */
  bgColor?: string;
  /** A logo image URL to overlay at the center. Bumps error correction to 'H' to tolerate the added noise. */
  logoUrl?: string;
  /** Shape of the data modules. Defaults to 'square'. SVG only — see generateQrPng's note. */
  moduleShape?: ModuleShape;
  /** Shape of the three finder-pattern "eyes". Defaults to 'square'. SVG only. */
  eyeShape?: EyeShape;
  /** Two-color gradient fill for modules/eyes, in place of a flat fgColor. SVG only. */
  gradient?: QrGradient;
  /** Tiles this image behind the QR as the background fill, in place of bgColor. SVG only. */
  bgImageUrl?: string;
  /** Decorative border around the QR. 'scan-me' adds a caption bar below it. SVG only. */
  frame?: FrameStyle;
  frameColor?: string;
  /** Caption shown in the 'scan-me' frame's bar. Defaults to "SCAN ME". */
  frameText?: string;
  /** Text rendered above the QR. SVG only. */
  headerText?: string;
  headerColor?: string;
  /** Text rendered below the QR (and below any 'scan-me' caption bar). SVG only. */
  footerText?: string;
  footerColor?: string;
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
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
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

function needsCustomRender(opts: QrDesignOptions): boolean {
  return Boolean(
    (opts.moduleShape && opts.moduleShape !== 'square') ||
    (opts.eyeShape && opts.eyeShape !== 'square') ||
    opts.gradient ||
    opts.bgImageUrl ||
    (opts.frame && opts.frame !== 'none') ||
    opts.headerText ||
    opts.footerText,
  );
}

/** The three 7x7 finder-pattern corners, as [row, col] of their top-left cell — fixed for every QR version. */
function eyeOrigins(moduleCount: number): [number, number][] {
  return [
    [0, 0],
    [0, moduleCount - 7],
    [moduleCount - 7, 0],
  ];
}

function cellRect(
  row: number,
  col: number,
  sizeCells: number,
  fill: string,
  shape: ModuleShape | EyeShape,
): string {
  const x = col * UNIT;
  const y = row * UNIT;
  const size = sizeCells * UNIT;

  if (shape === 'dots' || shape === 'circle') {
    const r = size / 2;
    return `<circle cx="${x + r}" cy="${y + r}" r="${r * 0.88}" fill="${fill}" />`;
  }
  if (shape === 'diamond') {
    const cx = x + size / 2;
    const cy = y + size / 2;
    return `<polygon points="${cx},${y} ${x + size},${cy} ${cx},${y + size} ${x},${cy}" fill="${fill}" />`;
  }
  if (shape === 'rounded') {
    const rx = size * 0.28;
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="${fill}" />`;
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" />`;
}

/** Renders the QR's raw module bitmatrix as custom-shaped SVG elements, for any option toString()/toBuffer() can't express. */
async function renderCustomQrBody(
  url: string,
  opts: QrDesignOptions,
): Promise<{ svg: string; canvasSize: number }> {
  const qr = QRCode.create(url, { errorCorrectionLevel: opts.logoUrl ? 'H' : 'M' });
  const { modules } = qr;
  const moduleCount = modules.size;
  const margin = 2;
  const canvasSize = (moduleCount + margin * 2) * UNIT;

  const moduleShape = opts.moduleShape ?? 'square';
  const eyeShape = opts.eyeShape ?? 'square';

  const defs: string[] = [];
  let fill = colorOption(opts.fgColor, '#000000').replace(/ff$/, '');
  if (opts.gradient) {
    const { from, to, direction = 'diagonal' } = opts.gradient;
    const coords =
      direction === 'horizontal'
        ? { x1: '0%', y1: '0%', x2: '100%', y2: '0%' }
        : direction === 'vertical'
          ? { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }
          : { x1: '0%', y1: '0%', x2: '100%', y2: '100%' };
    defs.push(
      `<linearGradient id="qrFill" x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}">` +
        `<stop offset="0%" stop-color="${from}" /><stop offset="100%" stop-color="${to}" /></linearGradient>`,
    );
    fill = 'url(#qrFill)';
  }

  const parts: string[] = [];

  if (opts.bgImageUrl) {
    defs.push(
      `<pattern id="qrBg" patternUnits="userSpaceOnUse" width="${canvasSize}" height="${canvasSize}">` +
        `<image href="${opts.bgImageUrl}" x="0" y="0" width="${canvasSize}" height="${canvasSize}" preserveAspectRatio="xMidYMid slice" /></pattern>`,
    );
    parts.push(
      `<rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="url(#qrBg)" />`,
    );
  } else if (opts.bgColor) {
    parts.push(
      `<rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="${opts.bgColor}" />`,
    );
  }

  const eyeCells = new Set<string>();
  for (const [r0, c0] of eyeOrigins(moduleCount)) {
    for (let r = r0; r < r0 + 7; r++) {
      for (let c = c0; c < c0 + 7; c++) eyeCells.add(`${r},${c}`);
    }
  }

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (eyeCells.has(`${r},${c}`)) continue;
      if (modules.get(r, c)) {
        parts.push(cellRect(r + margin, c + margin, 1, fill, moduleShape));
      }
    }
  }

  const bgFill = opts.bgColor ?? '#ffffff';
  for (const [r0, c0] of eyeOrigins(moduleCount)) {
    const or = r0 + margin;
    const oc = c0 + margin;
    parts.push(cellRect(or, oc, 7, fill, eyeShape));
    parts.push(cellRect(or + 1, oc + 1, 5, bgFill, eyeShape));
    parts.push(cellRect(or + 2, oc + 2, 3, fill, eyeShape));
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}" width="${canvasSize}" height="${canvasSize}">` +
    `${defsBlock}${parts.join('')}</svg>`;

  return { svg, canvasSize };
}

function wrapWithFrameAndText(innerSvg: string, canvasSize: number, opts: QrDesignOptions): string {
  const frame = opts.frame ?? 'none';
  const frameColor = opts.frameColor ?? '#000000';
  const framePad = frame !== 'none' ? UNIT * 2 : 0;
  const captionHeight = frame === 'scan-me' ? UNIT * 4 : 0;
  const headerHeight = opts.headerText ? UNIT * 4 : 0;
  const footerHeight = opts.footerText ? UNIT * 4 : 0;

  const outerWidth = canvasSize + framePad * 2;
  const outerHeight = canvasSize + framePad * 2 + captionHeight + headerHeight + footerHeight;
  const qrX = framePad;
  const qrY = framePad + headerHeight;

  const pieces: string[] = [];

  if (frame !== 'none') {
    const rx = frame === 'rounded' || frame === 'scan-me' ? UNIT * 1.5 : 0;
    pieces.push(
      `<rect x="${framePad / 2}" y="${framePad / 2 + headerHeight}" width="${canvasSize + framePad}" height="${canvasSize + framePad + captionHeight}" rx="${rx}" fill="none" stroke="${frameColor}" stroke-width="${UNIT * 0.4}" />`,
    );
  }

  if (opts.headerText) {
    pieces.push(
      `<text x="${outerWidth / 2}" y="${headerHeight * 0.65}" text-anchor="middle" font-size="${UNIT * 2.2}" fill="${opts.headerColor ?? '#000000'}" font-family="sans-serif">${escapeXml(opts.headerText)}</text>`,
    );
  }

  pieces.push(
    `<svg x="${qrX}" y="${qrY}" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">${innerSvgContent(innerSvg)}</svg>`,
  );

  if (frame === 'scan-me') {
    const barY = framePad + headerHeight + canvasSize;
    pieces.push(
      `<rect x="${framePad / 2}" y="${barY}" width="${canvasSize + framePad}" height="${captionHeight}" fill="${frameColor}" />`,
    );
    pieces.push(
      `<text x="${outerWidth / 2}" y="${barY + captionHeight * 0.65}" text-anchor="middle" font-size="${UNIT * 2}" fill="#ffffff" font-family="sans-serif" font-weight="bold">${escapeXml(opts.frameText ?? 'SCAN ME')}</text>`,
    );
  }

  if (opts.footerText) {
    const footerY = outerHeight - footerHeight * 0.35;
    pieces.push(
      `<text x="${outerWidth / 2}" y="${footerY}" text-anchor="middle" font-size="${UNIT * 2.2}" fill="${opts.footerColor ?? '#000000'}" font-family="sans-serif">${escapeXml(opts.footerText)}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outerWidth} ${outerHeight}" width="${outerWidth}" height="${outerHeight}">${pieces.join('')}</svg>`;
}

function innerSvgContent(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Black modules on a transparent background by default — print-ready for any
 * substrate color. Note: the `qrcode` library only omits its background
 * element (for a bare no-color-option call) when it's the SVG type — for PNG,
 * `color.light`'s alpha channel must be exactly 0, which colorOption()
 * defaults to for bgColor when unset.
 *
 * Plain color/logo requests go through the `qrcode` library's own renderer
 * unchanged (fast path, matches its existing output byte-for-byte). Anything
 * needing module/eye shapes, a gradient, a background image, a frame, or
 * header/footer text walks the QR's raw module bitmatrix and draws its own
 * SVG — see renderCustomQrBody(). PNG export only ever uses the fast path:
 * shape/frame/text/gradient customization is SVG-only, a deliberate scope
 * boundary (raster compositing would need a canvas library we don't have).
 */
export async function generateQrSvg(
  url: string,
  options?: QrDesignOptions | number,
): Promise<string> {
  // Backwards-compatible with the old `generateQrSvg(url, sizeMm)` call shape.
  const opts: QrDesignOptions = typeof options === 'number' ? { sizeMm: options } : (options ?? {});

  let svg: string;
  if (needsCustomRender(opts)) {
    const { svg: body, canvasSize } = await renderCustomQrBody(url, opts);
    svg = wrapWithFrameAndText(body, canvasSize, opts);
    if (opts.logoUrl) svg = withLogo(svg, opts.logoUrl);
  } else {
    svg = await QRCode.toString(url, {
      ...BASE_QR_OPTIONS,
      type: 'svg',
      errorCorrectionLevel: opts.logoUrl ? 'H' : 'M',
      color: {
        dark: colorOption(opts.fgColor, '#000000ff'),
        light: opts.bgColor ? colorOption(opts.bgColor, '#ffffffff') : '#00000000',
      },
    });
    if (opts.logoUrl) svg = withLogo(svg, opts.logoUrl);
  }

  if (opts.sizeMm !== undefined) {
    svg = withPhysicalSize(svg, opts.sizeMm);
  }
  return svg;
}
