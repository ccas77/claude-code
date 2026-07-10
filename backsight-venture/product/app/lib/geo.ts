/** Great-circle distance in kilometers (haversine). */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- PLSS section geometry (approximate, for demo-realistic scatter) ---------
// Townships 6N–9N, Ranges 68W–70W around Fort Collins, 6th PM.
// A township is ~6 miles square; a section ~1 mile.

const TWP_HEIGHT = 0.087; // degrees latitude per township
const SEC_HEIGHT = TWP_HEIGHT / 6;
const RNG_WIDTH = 0.113; // degrees longitude per range at ~40.5N
const SEC_WIDTH = RNG_WIDTH / 6;
const BASE_LAT = 40.35; // south edge of T6N (approx, demo purposes)
const BASE_LNG = -104.9; // east edge of R68W (approx, demo purposes)

/**
 * Approximate center lat/lng of a PLSS section in the Fort Collins demo area
 * (townships north, ranges west of the 6th PM), honoring the serpentine
 * section numbering (section 1 = NE corner, snaking west then east).
 */
export function sectionCenter(
  township: number,
  range: number,
  section: number,
): { lat: number; lng: number } {
  const row = Math.floor((section - 1) / 6); // 0 = north row (sections 1–6)
  const idx = (section - 1) % 6;
  const colFromEast = row % 2 === 0 ? idx : 5 - idx;
  const lat =
    BASE_LAT + (township - 6) * TWP_HEIGHT + (5 - row) * SEC_HEIGHT + SEC_HEIGHT / 2;
  const lng =
    BASE_LNG - (range - 68) * RNG_WIDTH - colFromEast * SEC_WIDTH - SEC_WIDTH / 2;
  return { lat, lng };
}
