import { useEffect, useState } from 'react';
import { fetchVesselTrail } from '../lib/api';

interface TrailState {
  mmsi: number | null;
  points: [number, number][];
}

/**
 * Fetches the recorded track for a vessel when trail display is enabled,
 * returning [lng, lat] coordinate pairs ready for a GeoJSON LineString.
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
): [number, number][] {
  const [state, setState] = useState<TrailState>({ mmsi: null, points: [] });

  useEffect(() => {
    if (mmsi === null || !enabled) return;

    let cancelled = false;
    const load = () => {
      const from = Date.now() / 1000 - windowSec;
      fetchVesselTrail(mmsi, from)
        .then((res) => {
          if (!cancelled) {
            setState({ mmsi, points: res.points.map((p) => [p[0], p[1]]) });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Failed to fetch vessel trail:', err);
            setState({ mmsi, points: [] });
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

  // Only surface points that belong to the current, enabled selection.
  return enabled && state.mmsi === mmsi ? state.points : [];
}
