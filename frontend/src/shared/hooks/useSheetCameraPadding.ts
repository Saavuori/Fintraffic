import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { cameraPadding, subscribeSheetHeight } from '../lib/sheetHeight';

/** How long the sheet has to hold still before the map follows it. */
const SETTLE_MS = 180;
/** Ignore sub-pixel churn; only re-frame when the band really moved. */
const EPSILON_PX = 4;

/**
 * Keeps the map framed inside the band a sheet leaves visible.
 *
 * On a phone, tapping a marker centres it on the viewport — which is behind the
 * sheet that just opened to describe it. MapLibre already models this as camera
 * padding, so rather than correcting every `flyTo` call site (and guessing how
 * tall the sheet is about to be), this watches the sheet's published height and
 * eases the map's padding to match once it settles. The centred target rises
 * into the visible band; closing the sheet eases it back.
 *
 * Drag frames publish too, so the move waits for the sheet to stop — a map that
 * re-framed on every frame of a drag would fight the finger.
 */
export function useSheetCameraPadding(getMap: () => maplibregl.Map | null): void {
  // Callers pass an inline `() => mapRef.current`, so the identity changes every
  // render; the subscription must not (its teardown resets the map's padding).
  const getMapRef = useRef(getMap);
  useEffect(() => {
    getMapRef.current = getMap;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const apply = () => {
      timer = null;
      const map = getMapRef.current();
      if (!map) return;
      const next = cameraPadding();
      const current = map.getPadding();
      if (Math.abs((current.bottom ?? 0) - next.bottom) < EPSILON_PX) return;
      map.easeTo({ padding: next, duration: 250 });
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, SETTLE_MS);
    };

    const unsubscribe = subscribeSheetHeight(schedule);
    schedule(); // catch a sheet that was already open when this mounted

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      // Leave the map as we found it — a mode switch shouldn't inherit the
      // previous mode's sheet.
      getMapRef.current()?.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    };
  }, []);
}
