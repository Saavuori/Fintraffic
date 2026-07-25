/** Where Raide's map opens — roughly the middle of the rail network.
 *
 * Lives here rather than in the map component so the app can start from the
 * same place — search offers the nearest trains on its first tap, which needs a
 * centre before anything has panned the map and reported one.
 */
export const INITIAL_CENTER: [number, number] = [25.75, 62.2];
export const INITIAL_ZOOM = 5.2;
