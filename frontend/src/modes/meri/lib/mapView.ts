/** Where Meri's map opens.
 *
 * Lives here rather than in the map component so the app can start from the
 * same place — search offers the nearest ships on its first tap, which needs a
 * centre before anything has panned the map and reported one.
 */
export const INITIAL_CENTER: [number, number] = [23.5, 60.5];
export const INITIAL_ZOOM = 5.5;
