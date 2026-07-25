/**
 * Track-history windows. The dotted trail is drawn over the chosen span and the
 * track replay rewinds exactly those points, so one list defines the range of
 * both — picking "7d" means seven days of trail *and* seven days of playback.
 */
export const TRAIL_WINDOWS: { label: string; sec: number }[] = [
  { label: '1h', sec: 3600 },
  { label: '24h', sec: 24 * 3600 },
  { label: '7d', sec: 7 * 24 * 3600 },
  { label: '60d', sec: 60 * 24 * 3600 },
];
