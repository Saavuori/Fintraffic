import { useCallback, useState } from 'react';
import type { StreamMessage, Vessel } from '../types';

/**
 * Holds the live vessel map. Snapshots replace the whole map (that is also the
 * stale-data safety net — the server resyncs every 60s); deltas merge changed
 * vessels and drop removed ones.
 */
export function useVesselData() {
  const [vessels, setVessels] = useState<Record<string, Vessel>>({});

  const handleMessage = useCallback((msg: StreamMessage) => {
    setVessels((prev) => {
      if (msg.type === 'snapshot') {
        return msg.vessels;
      }
      const next = { ...prev, ...msg.vessels };
      if (msg.removed) {
        for (const mmsi of msg.removed) {
          delete next[mmsi];
        }
      }
      return next;
    });
  }, []);

  return { vessels, handleMessage };
}
