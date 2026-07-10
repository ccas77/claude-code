/**
 * Geocoding — MOCKED in this demo.
 *
 * In the demo build every job comes pre-seeded with lat/lng, and Prior-Work
 * Radar address search matches against those seeded addresses. No geocoding
 * network call is ever made at runtime (quality bar: no external calls except
 * map tiles).
 *
 * TODO(production): wire this to the free US Census Bureau Geocoder
 * (https://geocoding.geo.census.gov/geocoder/) — no API key required:
 *
 *   GET https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
 *       ?address=<oneline>&benchmark=Public_AR_Current&format=json
 *
 * Response: result.addressMatches[0].coordinates -> { x: lng, y: lat }.
 * Add: request timeout (~5s), rate limiting/batching for imports, and a
 * result cache table so repeat lookups stay offline-friendly.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  matchedAddress: string;
  source: "census";
}

/**
 * Stub. Always returns null in the demo; the Radar falls back to matching
 * seeded job addresses instead. See TODO above for the production plan.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  return null;
}
