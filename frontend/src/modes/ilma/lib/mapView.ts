/** Where Ilma's map opens — the whole country, Hanko to Utsjoki.
 *
 * Lives here rather than in the map component so the app can start from the
 * same place — search offers the nearest aircraft on its first tap, which needs
 * a centre before anything has panned the map and reported one.
 */
export const INITIAL_CENTER: [number, number] = [25.5, 64.2];
export const INITIAL_ZOOM = 4.6;
