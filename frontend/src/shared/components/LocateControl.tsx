import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { LocateFixed } from 'lucide-react';

interface LocateControlProps {
  /** Returns the live map instance, or null before it has initialized. */
  getMap: () => maplibregl.Map | null;
}

/**
 * Bottom-right "Locate me" button shared by every mode. Centers the map on the
 * browser's geolocation, drops a "you are here" marker, and surfaces a
 * transient error toast when the location can't be resolved. Extracted from the
 * tie map so meri/raide/tie all share one control.
 */
export const LocateControl: React.FC<LocateControlProps> = ({ getMap }) => {
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const geoErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (geoErrorTimeoutRef.current) clearTimeout(geoErrorTimeoutRef.current);
      userLocationMarkerRef.current?.remove();
    },
    []
  );

  const showGeoError = (message: string) => {
    setGeoError(message);
    if (geoErrorTimeoutRef.current) clearTimeout(geoErrorTimeoutRef.current);
    geoErrorTimeoutRef.current = setTimeout(() => setGeoError(null), 5000);
  };

  const locateUser = () => {
    const m = getMap();
    if (!m) return;
    if (!navigator.geolocation) {
      showGeoError('Geolocation is not supported by this browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLngLat(coords);
        } else {
          const el = document.createElement('div');
          el.className = 'user-location-dot';
          userLocationMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(m);
        }
        m.flyTo({ center: coords, zoom: 14, essential: true });
      },
      (error) => {
        setLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Location unavailable.'
              : 'Location request timed out.';
        showGeoError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <>
      <button
        className="locate-control"
        onClick={locateUser}
        disabled={locating}
        aria-label="Locate me"
        title="Locate me"
      >
        <LocateFixed size={18} className={locating ? 'locate-spin' : undefined} />
      </button>
      {geoError && <div className="locate-error">{geoError}</div>}
    </>
  );
};
