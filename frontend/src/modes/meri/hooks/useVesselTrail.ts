import { useEffect, useState } from 'react';
import { fetchVesselTrail } from '../lib/api';
import type { TrailPoint } from '../types';

interface TrailState {
  mmsi: number | null;
  points: TrailPoint[];
}

const EMPTY: TrailPoint[] = [];

/**
 * Fetches the recorded track for a vessel when trail display is enabled,
 * returning [lng, lat, ts, cog, sog] points — the leading pair draws the
 * GeoJSON LineString, the rest lets the track replay animate along it.
 *
 * Refetches when the vessel, enabled flag, or window changes, and polls every
 * 30s so the head of the track keeps up with the vessel's live movement. State
 * is tagged with the vessel it belongs to, so the return value is empty
 * whenever the trail is disabled or the latest fetch is for a stale selection —
 * no synchronous clearing inside the effect required.
 */
export function useVesselTrail(
  mmsi: number | null,
  enabled: boolean,
  windowSec: number
): TrailPoint[] {
  const [state, setState] = useState<TrailState>({ mmsi: null, points: [] });

  useEffect(() => {
    if (mmsi === null || !enabled) return;

    let cancelled = false;
    const load = () => {
      const from = Date.now() / 1000 - windowSec;
      fetchVesselTrail(mmsi, from)
        .then((res) => {
          if (!cancelled) {
            setState({ mmsi, points: res.points });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Failed to fetch vessel trail:', err);
            setState({ mmsi, points: EMPTY });
          }
        });
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mmsi, enabled, windowSec]);

  // Only surface points that belong to the current, enabled selection. The
  // shared EMPTY keeps the "no trail" identity stable, so consumers that key
  // off the array (the map source, the replay clock) don't churn every render.
  return enabled && state.mmsi === mmsi ? state.points : EMPTY;
}
