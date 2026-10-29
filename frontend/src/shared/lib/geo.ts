// Flat-earth geometry shared by the modes. Every helper is equirectangular:
// accurate to a fraction of a percent over the tens of kilometres the maps rank
// and project over, and far cheaper than haversine when run across a whole
// fleet on every map move or animation frame.

const EARTH_RADIUS_M = 6371000;
const KNOTS_TO_MS = 0.514444;
const DEG = Math.PI / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Where something is `dtSeconds` after a fix, moving straight on at
 * `speedKnots` along `courseDeg` (degrees true) — the few hundred metres a ship
 * or couple of kilometres a jet covers between position reports.
 */
export function deadReckon(
  lat: number,
  lng: number,
  speedKnots: number,
  courseDeg: number,
  dtSeconds: number
): LatLng {
  const dist = speedKnots * KNOTS_TO_MS * dtSeconds;
  const bearing = courseDeg * DEG;
  const dLat = (dist * Math.cos(bearing)) / EARTH_RADIUS_M / DEG;
  const dLng = (dist * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(lat * DEG)) / DEG;
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Distance between two points in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const meanLat = ((a.lat + b.lat) / 2) * DEG;
  const dx = (a.lng - b.lng) * Math.cos(meanLat);
  const dy = a.lat - b.lat;
  return (Math.sqrt(dx * dx + dy * dy) * DEG * EARTH_RADIUS_M) / 1000;
}

/** Compact distance label: metres under 1 km, one decimal under 10 km. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
