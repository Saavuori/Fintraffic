import { useCallback, useSyncExternalStore } from 'react';

/** The single source of truth for the phone breakpoint, shared by every mode. */
export const MOBILE_QUERY = '(max-width: 768px)';

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
