import { useCallback, useSyncExternalStore } from 'react';

/** The single source of truth for the phone breakpoint, shared by every mode. */
export const MOBILE_QUERY = '(max-width: 768px)';

/**
 * A phone on its side. There is no room for a bottom sheet here — anything tall
 * enough to read covers the map entirely — so these viewports get side rails
 * instead (see BottomSheet). Note that many phones are wider than 768px in
 * landscape and so are already on the desktop layout; this catches the rest.
 */
export const SHORT_LANDSCAPE_QUERY = '(max-height: 500px) and (orientation: landscape)';

/**
 * Reactive `matchMedia`. Unlike a one-time `window.matchMedia(q).matches` read,
 * this re-renders when the match changes — so rotation, window resize and
 * responsive-emulation flips are all handled. Built on `useSyncExternalStore`
 * so the subscription and the current value stay consistent (and it's SSR-safe:
 * the server snapshot is `false`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True on phone-width viewports (≤768px). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
