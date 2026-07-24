const EARTH_RADIUS_M = 6371000;
const KNOTS_TO_MS = 0.514444;
const DEG = 180 / Math.PI;

/**
 * Projects a position forward along a course at a given speed.
 * Equirectangular approximation — plenty accurate for the few hundred meters
 * a ship covers between AIS fixes.
 */
export function deadReckon(
  lat: number,
  lng: number,
  sogKnots: number,
  cogDeg: number,
  dtSeconds: number
): { lat: number; lng: number } {
  const dist = sogKnots * KNOTS_TO_MS * dtSeconds;
  const bearing = cogDeg / DEG;
  const dLat = (dist * Math.cos(bearing)) / EARTH_RADIUS_M * DEG;
  const dLng = (dist * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(lat / DEG)) * DEG;
  return { lat: lat + dLat, lng: lng + dLng };
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Great-circle-ish distance in kilometres. Equirectangular approximation —
 * accurate to a fraction of a percent at the ranges we rank on (tens of km) and
 * far cheaper than haversine when scoring a whole fleet on every map move.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const meanLat = ((a.lat + b.lat) / 2) / DEG;
  const dx = (a.lng - b.lng) * Math.cos(meanLat);
  const dy = a.lat - b.lat;
  return (Math.sqrt(dx * dx + dy * dy) * Math.PI * EARTH_RADIUS_M) / 180 / 1000;
}

/** The `count` items closest to `center`, each paired with its distance (km). */
export function nearestTo<T extends LatLng>(
  center: LatLng,
  items: T[],
  count: number
): Array<{ item: T; km: number }> {
  return items
    .map((item) => ({ item, km: distanceKm(center, item) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

/** Compact distance label: metres under 1 km, one decimal under 10 km. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
