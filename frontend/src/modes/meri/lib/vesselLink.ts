/**
 * Direct links to a vessel: `/?vessel=<MMSI>` opens Meri with that ship
 * selected and the map flown to it. The address bar mirrors the selection
 * (replaceState, so selecting ships doesn't pile up history entries), which
 * makes the plain browser URL shareable too.
 */

export const VESSEL_PARAM = 'vessel';

/** An MMSI is nine digits; anything else in the param is ignored. */
export function parseVesselParam(search: string): number | null {
  const raw = new URLSearchParams(search).get(VESSEL_PARAM);
  if (!raw || !/^\d{9}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** The vessel the page was opened for, if any. */
export function initialLinkedVessel(): number | null {
  if (typeof window === 'undefined') return null;
  return parseVesselParam(window.location.search);
}

/** `href` with the vessel param set to `mmsi` (or removed for null). */
export function withVesselParam(href: string, mmsi: number | null): string {
  const url = new URL(href);
  if (mmsi === null) url.searchParams.delete(VESSEL_PARAM);
  else url.searchParams.set(VESSEL_PARAM, String(mmsi));
  return url.toString();
}

/** The shareable link for a vessel on this deployment. */
export function vesselLink(mmsi: number): string {
  const url = new URL(withVesselParam(window.location.href, mmsi));
  url.hash = '';
  return url.toString();
}

/** Mirror the selection into the address bar without adding history. */
export function syncVesselParam(mmsi: number | null): void {
  if (typeof window === 'undefined') return;
  const next = withVesselParam(window.location.href, mmsi);
  if (next !== window.location.href) {
    window.history.replaceState(window.history.state, '', next);
  }
}
