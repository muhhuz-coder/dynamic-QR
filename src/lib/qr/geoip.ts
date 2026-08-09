export interface GeoLocation {
  country: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

const UNKNOWN_LOCATION: GeoLocation = {
  country: 'Unknown',
  city: 'Unknown',
  latitude: null,
  longitude: null,
  timezone: null,
};

export interface GeoIpProvider {
  lookup(ipAddress: string): Promise<GeoLocation>;
}

/**
 * No real GeoIP provider is wired up yet (no MaxMind/ipapi account provisioned).
 * This always resolves to "Unknown" rather than throwing, so callers get the same
 * graceful-degradation behavior they'd get from a real provider outage — see
 * docs/core-logic/09-error-handling-edge-cases.md.
 */
export const unknownGeoIpProvider: GeoIpProvider = {
  async lookup() {
    return UNKNOWN_LOCATION;
  },
};

/**
 * Resolves a location for `ipAddress`, never throwing — a failing/unset provider
 * degrades to "Unknown" so it can never block the QR scan redirect.
 */
export async function getLocationFromIP(
  ipAddress: string,
  provider: GeoIpProvider = unknownGeoIpProvider,
): Promise<GeoLocation> {
  try {
    return await provider.lookup(ipAddress);
  } catch {
    return UNKNOWN_LOCATION;
  }
}
