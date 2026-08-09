import type { ContentType } from '@/generated/prisma/client';

export interface TextPayload {
  text: string;
}

export interface VCardPayload {
  name: string;
  phone?: string;
  email?: string;
  org?: string;
}

export interface WifiPayload {
  ssid: string;
  password?: string;
  /** WPA covers WPA/WPA2/WPA3 for QR-encoding purposes — they all use the same field. */
  security?: 'WPA' | 'WEP' | 'nopass';
}

export type ContentPayload = TextPayload | VCardPayload | WifiPayload;

export class InvalidContentPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContentPayloadError';
  }
}

/** Escapes characters with special meaning in vCard/Wi-Fi QR payload formats. */
function escapeField(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,');
}

/**
 * Builds the literal string encoded into the QR image for a non-URL content
 * type — exactly what any standalone vCard/Wi-Fi QR generator would produce,
 * so it scans correctly in any phone's camera app, not just ours.
 */
export function buildQrPayload(contentType: ContentType, payload: ContentPayload | null): string {
  if (contentType === 'URL') {
    throw new InvalidContentPayloadError('buildQrPayload is only for non-URL content types');
  }
  if (!payload) {
    throw new InvalidContentPayloadError(`Missing payload for content type ${contentType}`);
  }

  switch (contentType) {
    case 'TEXT': {
      const { text } = payload as TextPayload;
      if (!text) throw new InvalidContentPayloadError('TEXT payload requires "text"');
      return text;
    }
    case 'VCARD': {
      const { name, phone, email, org } = payload as VCardPayload;
      if (!name) throw new InvalidContentPayloadError('VCARD payload requires "name"');
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeField(name)}`];
      if (phone) lines.push(`TEL:${escapeField(phone)}`);
      if (email) lines.push(`EMAIL:${escapeField(email)}`);
      if (org) lines.push(`ORG:${escapeField(org)}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'WIFI': {
      const { ssid, password, security } = payload as WifiPayload;
      if (!ssid) throw new InvalidContentPayloadError('WIFI payload requires "ssid"');
      const sec = security ?? 'WPA';
      const passwordField = sec === 'nopass' ? '' : `P:${escapeField(password ?? '')};`;
      return `WIFI:T:${sec};S:${escapeField(ssid)};${passwordField}H:false;;`;
    }
    default:
      throw new InvalidContentPayloadError(`Unknown content type: ${contentType}`);
  }
}

/** Human-readable label stored in targetUrl for the dashboard's Destination column — see schema.prisma. */
export function deriveContentLabel(
  contentType: ContentType,
  payload: ContentPayload | null,
): string {
  if (contentType === 'URL' || !payload) return '';

  switch (contentType) {
    case 'TEXT':
      return `Text: ${(payload as TextPayload).text.slice(0, 60)}`;
    case 'VCARD':
      return `vCard: ${(payload as VCardPayload).name}`;
    case 'WIFI':
      return `Wi-Fi: ${(payload as WifiPayload).ssid}`;
    default:
      return '';
  }
}
