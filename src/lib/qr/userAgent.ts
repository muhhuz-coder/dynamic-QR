export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function parseDeviceType(userAgent: string): DeviceType {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

export function parseOS(userAgent: string): string {
  if (/ios|iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
}

export function parseBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent) && !/chrome|crios|android/i.test(userAgent)) return 'Safari';
  return 'Unknown';
}
