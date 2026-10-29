import { distanceKm, type LatLng } from '../../../shared/lib/geo';

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
