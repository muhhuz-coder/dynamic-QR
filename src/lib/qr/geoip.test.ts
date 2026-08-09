import { describe, expect, it } from 'vitest';

import { getLocationFromIP, type GeoIpProvider } from './geoip';

describe('getLocationFromIP', () => {
  it('returns the provider result on success', async () => {
    const provider: GeoIpProvider = {
      async lookup() {
        return {
          country: 'PK',
          city: 'Lahore',
          latitude: 31.5,
          longitude: 74.3,
          timezone: 'Asia/Karachi',
        };
      },
    };
    const location = await getLocationFromIP('1.2.3.4', provider);
    expect(location.city).toBe('Lahore');
  });

  it('degrades to Unknown when the provider throws (service down)', async () => {
    const provider: GeoIpProvider = {
      async lookup() {
        throw new Error('geoip service unavailable');
      },
    };
    const location = await getLocationFromIP('1.2.3.4', provider);
    expect(location).toEqual({
      country: 'Unknown',
      city: 'Unknown',
      latitude: null,
      longitude: null,
      timezone: null,
    });
  });

  it('defaults to the unknown provider when none is given', async () => {
    const location = await getLocationFromIP('1.2.3.4');
    expect(location.city).toBe('Unknown');
  });
});
