/**
 * How much of the screen the phone's sheets are covering, in px.
 *
 * `useBottomSheet` already publishes this to `--sheet-height-<id>` on <html> for
 * the CSS side (map controls easing clear of a sheet). Camera moves need the
 * same number in JS: a marker centred on the raw viewport centre on a phone
 * lands *behind* the sheet that was opened to describe it. So the sheet
 * publishes here too, and map code asks for `cameraPadding()` when it flies.
 */

const heights = new Map<string, number>();
const listeners = new Set<() => void>();

/** Called by useBottomSheet on every resting position (and while dragging). */
export function publishSheetHeight(id: string, px: number): void {
  const next = Math.max(0, Math.round(px));
  if (heights.get(id) === next) return;
  heights.set(id, next);
  for (const fn of listeners) fn();
}

/** Fires on every height change, drag frames included — debounce if you care. */
export function subscribeSheetHeight(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The tallest sheet currently on screen — they overlap, so max, not sum. */
export function activeSheetHeight(): number {
  let max = 0;
  for (const px of heights.values()) if (px > max) max = px;
  return max;
}

/** The bottom tab bar's reserved band, read from the same variable CSS uses. */
function tabBarHeight(): number {
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--tabbar-height');
  const px = parseFloat(declared);
  return Number.isFinite(px) ? px : 0;
}

/**
 * Camera padding that keeps a centred target inside the *visible* map band.
 * Pass it to `flyTo`/`easeTo`/`jumpTo`; it is all zeroes on desktop, where
 * nothing covers the map.
 */
export function cameraPadding(): { top: number; bottom: number; left: number; right: number } {
  const bottom = activeSheetHeight() + tabBarHeight();
  // A sheet taller than the map would leave no band to centre in; cap it so the
  // target lands just above the sheet's edge rather than off the top.
  const capped = Math.min(bottom, Math.round(window.innerHeight * 0.6));
  return { top: 0, bottom: capped, left: 0, right: 0 };
}
