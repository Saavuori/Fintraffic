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
