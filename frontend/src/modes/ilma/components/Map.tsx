import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  type Aircraft,
  type AircraftGroup,
  type Airport,
  type Snapshot,
  type TrailPoint,
  GROUP_ORDER,
  ALTITUDE_STOPS,
  AIRPORT_COLORS,
  EMERGENCY_COLOR,
  advance,
  aircraftTitle,
  altitudeShort,
  altitudeText,
  groupColors,
  speedText,
} from '../lib/aircraft';
import { type LayerVisibility } from '../lib/layers';
import { type Theme, BASEMAP_STYLES, MARKER_HALO, SELECTION_COLORS } from '../lib/theme';
import { loadMapIcons, AIRCRAFT_ICON_ID, AIRPORT_ICON_ID } from '../lib/mapIcons';
import { LocateControl } from '../../../shared/components/LocateControl';
import { CollapsedAttributionControl } from '../../../shared/lib/attribution';
import { INITIAL_CENTER, INITIAL_ZOOM } from '../lib/mapView';

/** A request to bring something into view; `seq` makes a repeat request distinct. */
export interface FocusRequest {
  lng: number;
  lat: number;
  seq: number;
}

interface MapProps {
  onSelectAircraft: (aircraft: Aircraft) => void;
  onSelectAirport: (airport: Airport) => void;
  /** Fired after every poll so App can refresh the selection, counts and search. */
  onAircraftUpdate: (aircraft: Aircraft[]) => void;
  /** Fired when the airport register lands, so App can offer it to search. */
  onAirportsUpdate?: (airports: Airport[]) => void;
  /** The selected aircraft, ringed and drawn with its recent trail. */
  selectedHex: string | null;
  /** Fly here when it changes (search picks; map clicks fly on their own). */
  focus: FocusRequest | null;
  visibility: LayerVisibility;
  theme: Theme;
  /** Fires (on moveend) with the viewport centre for the "nearest aircraft" list. */
  onMoveEnd?: (center: { lng: number; lat: number }) => void;
}

const POLL_MS = 10000;
// Dead-reckoning cadence. A jet at country zoom moves a pixel every second or
// so; four frames a second is smooth there and still cheap at city zoom.
const FRAME_MS = 250;
// Never project a fix further than this: a target the receivers lost should
// stop where it was last seen, not fly on across the map.
const MAX_PROJECT_S = 30;

const AIRCRAFT_SOURCE = 'aircraft';
const AIRPORTS_SOURCE = 'airports';
const TRAIL_SOURCE = 'selected-trail';
const SELECTED_SOURCE = 'selected-aircraft';

const AIRPORTS_LAYER = 'airports-icon';
const AIRPORTS_LABEL_LAYER = 'airports-label';
const TRAIL_LAYER = 'selected-trail-line';
const SELECTED_LAYER = 'selected-aircraft-ring';

// Per group: an emergency ring under the silhouette, the silhouette itself
// (rotated to the track), and the callsign label. Built from the group name so
// a toggle can hide the whole stack without touching the shared source.
const aircraftLayerIds = (group: AircraftGroup) => ({
  alert: `aircraft-${group}-alert`,
  icon: `aircraft-${group}`,
  label: `aircraft-${group}-label`,
});

// Base silhouette scale per group, so an airliner reads bigger than a Cessna.
const ICON_SCALE: Record<AircraftGroup, number> = {
  airline: 0.44,
  general: 0.34,
  rotorcraft: 0.38,
  military: 0.4,
};

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

function setLayersVisible(m: maplibregl.Map, layerIds: string[], visible: boolean) {
  for (const id of layerIds) {
    if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Callsign labels follow both their group's toggle and the labels toggle. */
function applyVisibility(m: maplibregl.Map, v: LayerVisibility) {
  for (const group of GROUP_ORDER) {
    const { alert, icon, label } = aircraftLayerIds(group);
    setLayersVisible(m, [alert, icon], v[group]);
    setLayersVisible(m, [label], v[group] && v.labels);
  }
  setLayersVisible(m, [AIRPORTS_LAYER, AIRPORTS_LABEL_LAYER], v.airports);
}

/** Where an aircraft is now, by its last fix projected along its track. */
function livePosition(a: Aircraft, now: number): [number, number] {
  if (a.groundSpeedKt == null || a.track == null || a.groundSpeedKt < 1) {
    return [a.longitude, a.latitude];
  }
  const dt = Math.min(Math.max((now - a.timestamp) / 1000, 0), MAX_PROJECT_S);
  const p = advance(a.latitude, a.longitude, a.groundSpeedKt, a.track, dt);
  return [p.lng, p.lat];
}

function toAircraftGeoJSON(aircraft: Aircraft[], now: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: aircraft.map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: livePosition(a, now) },
      properties: {
        hex: a.hex,
        group: a.group,
        track: a.track ?? 0,
        label: a.callsign || a.registration || '',
        alt: altitudeShort(a),
        onGround: a.onGround,
        emergency: Boolean(a.emergency),
      },
    })),
  };
}

function toAirportsGeoJSON(airports: Airport[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: airports.map(ap => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ap.longitude, ap.latitude] },
      properties: { icao: ap.icao, name: ap.name, scheduled: ap.scheduled },
    })),
  };
}

/**
 * The selected aircraft's trail as one segment per pair of points, each
 * carrying the altitude it was flown at, so the line can be coloured along its
 * length by a plain data-driven `line-color`. The live (projected) position
 * closes the trail so it always meets the silhouette.
 */
function toTrailGeoJSON(
  points: TrailPoint[],
  live: { position: [number, number]; altitudeFt?: number } | null
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords: Array<{ c: [number, number]; alt: number }> = points.map(p => ({
    c: [p.longitude, p.latitude],
    alt: p.altitudeFt ?? 0,
  }));
  if (live) coords.push({ c: live.position, alt: live.altitudeFt ?? coords.at(-1)?.alt ?? 0 });

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 1; i < coords.length; i++) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [coords[i - 1].c, coords[i].c] },
      properties: { alt: (coords[i - 1].alt + coords[i].alt) / 2 },
    });
  }
  return { type: 'FeatureCollection', features };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Hover popups are mouse-only: on a touch screen `mousemove` fires on tap and
// leaves the popup stranded over the map with no pointer to move away.
const HOVER_CAPABLE = !window.matchMedia('(pointer: coarse)').matches;

const Map: React.FC<MapProps> = ({
  onSelectAircraft,
  onSelectAirport,
  onAircraftUpdate,
  onAirportsUpdate,
  selectedHex,
  focus,
  visibility,
  theme,
  onMoveEnd,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  // The mount effect registers its map handlers and timers once, so they read
  // every callback through this ref: an identity change from the parent must
  // never leave them calling the mounting render's copy.
  const callbacks = { onSelectAircraft, onSelectAirport, onAircraftUpdate, onAirportsUpdate, onMoveEnd };
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // Latest data, read by the frame loop and by every (re)install.
  const aircraftRef = useRef<Aircraft[]>([]);
  const aircraftByHex = useRef<globalThis.Map<string, Aircraft>>(new globalThis.Map());
  const airportsRef = useRef<Airport[]>([]);
  const airportsByIcao = useRef<globalThis.Map<string, Airport>>(new globalThis.Map());
  const trailRef = useRef<TrailPoint[]>([]);
  // Server clock minus ours, so projecting from server timestamps doesn't
  // depend on the visitor's clock being right.
  const clockOffsetRef = useRef(0);

  const selectedRef = useRef(selectedHex);
  const visibilityRef = useRef(visibility);
  const themeRef = useRef(theme);
  // Theme whose basemap style is currently loaded, so the theme effect can tell
  // a real switch from its own first run.
  const styleThemeRef = useRef(theme);
  // Set by the mount effect; lets the theme effect rebuild the layers a
  // setStyle() has just discarded.
  const installLayersRef = useRef<(() => void) | null>(null);
  // False while a style swap is in flight: nothing may add a source to a style
  // that is about to be thrown away.
  const styleReadyRef = useRef(false);
  const fetchTrailRef = useRef<(() => void) | null>(null);

  // Swap the basemap when the theme changes. setStyle() throws away every
  // custom source, layer and image, so the install runs again once the new
  // style is ready (see raide's map for why both events are listened to).
  useEffect(() => {
    themeRef.current = theme;
    const m = map.current;
    if (!m || styleThemeRef.current === theme) return;
    styleThemeRef.current = theme;
    styleReadyRef.current = false;
    m.setStyle(BASEMAP_STYLES[theme]);

    let installed = false;
    const onReady = () => {
      if (installed) return;
      installed = true;
      m.off('style.load', onReady);
      m.off('styledata', onReady);
      styleReadyRef.current = true;
      installLayersRef.current?.();
    };
    m.on('style.load', onReady);
    m.on('styledata', onReady);
    return () => {
      m.off('style.load', onReady);
      m.off('styledata', onReady);
    };
  }, [theme]);

  useEffect(() => {
    visibilityRef.current = visibility;
    if (map.current) applyVisibility(map.current, visibility);
  }, [visibility]);

  // A new selection starts from an empty trail and fetches its own at once;
  // the poll keeps it current after that.
  useEffect(() => {
    selectedRef.current = selectedHex;
    trailRef.current = [];
    if (selectedHex) fetchTrailRef.current?.();
  }, [selectedHex]);

  // Bring a searched-for aircraft or airport into view, zooming in only as far
  // as it takes to pick it out from its neighbours.
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(m.getZoom(), 8), essential: true });
  }, [focus]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLES[themeRef.current],
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
      // The frame loop re-sets the aircraft source four times a second, and a
      // moved label counts as a new one: with the default 300 ms fade every
      // callsign would be forever fading in and never be seen.
      fadeDuration: 0,
    });
    map.current = m;
    m.addControl(
      new CollapsedAttributionControl({
        customAttribution:
          'Aircraft: <a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a> · ' +
          '<a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (ODbL)',
      }),
      'bottom-left'
    );
    if (import.meta.env.DEV) (window as unknown as { __map?: maplibregl.Map }).__map = m;

    const emitCenter = () => {
      const c = m.getCenter();
      callbacksRef.current.onMoveEnd?.({ lng: c.lng, lat: c.lat });
    };
    m.on('moveend', emitCenter);
    emitCenter();

    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });

    // Layers are re-added after every theme swap, but map event listeners
    // survive setStyle() — without this guard each swap would stack another
    // copy of every handler.
    const boundLayers = new Set<string>();
    const bindOnce = (layerId: string, bind: () => void) => {
      if (boundLayers.has(layerId)) return;
      boundLayers.add(layerId);
      bind();
    };

    const bindHover = (layerId: string, html: (f: MapGeoJSONFeature) => string | null) => {
      m.on('mouseenter', layerId, () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', layerId, () => {
        m.getCanvas().style.cursor = '';
        hoverPopup.remove();
      });
      if (HOVER_CAPABLE) {
        m.on('mousemove', layerId, e => {
          const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!feature || feature.geometry.type !== 'Point') return;
          const content = html(feature);
          if (!content) return;
          hoverPopup
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setHTML(content)
            .addTo(m);
        });
      }
    };

    const attachAircraftInteractions = (layerId: string) =>
      bindOnce(layerId, () => {
        bindHover(layerId, f => {
          const a = aircraftByHex.current.get((f.properties as { hex: string }).hex);
          if (!a) return null;
          const what = [a.airline, a.typeName || a.typeCode].filter(Boolean).join(' · ');
          return (
            `<strong>${escapeHTML(aircraftTitle(a))}</strong><br/>` +
            (what ? `${escapeHTML(what)}<br/>` : '') +
            `${altitudeText(a)} · ${speedText(a)}`
          );
        });
        m.on('click', layerId, e => {
          const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!feature || feature.geometry.type !== 'Point') return;
          const a = aircraftByHex.current.get((feature.properties as { hex: string }).hex);
          if (!a) return;
          callbacksRef.current.onSelectAircraft(a);
          m.easeTo({ center: feature.geometry.coordinates as [number, number] });
        });
      });

    const attachAirportInteractions = (layerId: string) =>
      bindOnce(layerId, () => {
        bindHover(layerId, f => {
          const ap = airportsByIcao.current.get((f.properties as { icao: string }).icao);
          if (!ap) return null;
          return `<strong>${escapeHTML(ap.name)}</strong><br/>${ap.icao}${ap.iata ? ` · ${ap.iata}` : ''}`;
        });
        m.on('click', layerId, e => {
          const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!feature) return;
          const ap = airportsByIcao.current.get((feature.properties as { icao: string }).icao);
          if (!ap) return;
          callbacksRef.current.onSelectAirport(ap);
          m.flyTo({ center: [ap.longitude, ap.latitude], zoom: Math.max(m.getZoom(), 9), essential: true });
        });
      });

    const installAirports = () => {
      if (m.getSource(AIRPORTS_SOURCE)) return;
      const color = AIRPORT_COLORS[themeRef.current];
      const halo = MARKER_HALO[themeRef.current];
      m.addSource(AIRPORTS_SOURCE, { type: 'geojson', data: toAirportsGeoJSON(airportsRef.current) });
      m.addLayer({
        id: AIRPORTS_LAYER,
        type: 'symbol',
        source: AIRPORTS_SOURCE,
        layout: {
          'icon-image': AIRPORT_ICON_ID,
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            4, ['case', ['get', 'scheduled'], 0.22, 0.15],
            9, ['case', ['get', 'scheduled'], 0.42, 0.32],
          ],
          'icon-allow-overlap': true,
        },
        paint: { 'icon-color': color, 'icon-halo-color': halo, 'icon-halo-width': 1 },
      });
      // Airports with scheduled flights are named from country zoom; airfields
      // only once there is room for them.
      m.addLayer({
        id: AIRPORTS_LABEL_LAYER,
        type: 'symbol',
        source: AIRPORTS_SOURCE,
        filter: ['any', ['get', 'scheduled'], ['>=', ['zoom'], 7.5]],
        minzoom: 5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Montserrat Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 13],
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.9,
          'text-justify': 'auto',
        },
        paint: { 'text-color': color, 'text-halo-color': halo, 'text-halo-width': 1.4 },
      });
      attachAirportInteractions(AIRPORTS_LAYER);
      attachAirportInteractions(AIRPORTS_LABEL_LAYER);
    };

    const installSelection = () => {
      if (m.getSource(TRAIL_SOURCE)) return;
      const ramp: (string | number)[] = [];
      for (const [ft, color] of ALTITUDE_STOPS) ramp.push(ft, color);
      m.addSource(TRAIL_SOURCE, { type: 'geojson', data: EMPTY_FC });
      m.addLayer({
        id: TRAIL_LAYER,
        type: 'line',
        source: TRAIL_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'alt'], ...ramp] as maplibregl.ExpressionSpecification,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 3.5],
          'line-opacity': 0.9,
        },
      });
      m.addSource(SELECTED_SOURCE, { type: 'geojson', data: EMPTY_FC });
      m.addLayer({
        id: SELECTED_LAYER,
        type: 'circle',
        source: SELECTED_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 13, 10, 20],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': SELECTION_COLORS[themeRef.current],
        },
      });
    };

    const installAircraft = () => {
      if (m.getSource(AIRCRAFT_SOURCE)) return;
      const colors = groupColors(themeRef.current);
      const halo = MARKER_HALO[themeRef.current];
      m.addSource(AIRCRAFT_SOURCE, {
        type: 'geojson',
        data: toAircraftGeoJSON(aircraftRef.current, Date.now() + clockOffsetRef.current),
      });
      for (const group of GROUP_ORDER) {
        const { alert, icon, label } = aircraftLayerIds(group);
        const s = ICON_SCALE[group];
        m.addLayer({
          id: alert,
          type: 'circle',
          source: AIRCRAFT_SOURCE,
          filter: ['all', ['==', ['get', 'group'], group], ['get', 'emergency']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 18],
            'circle-color': 'rgba(239,68,68,0.18)',
            'circle-stroke-width': 2,
            'circle-stroke-color': EMERGENCY_COLOR,
          },
        });
        m.addLayer({
          id: icon,
          type: 'symbol',
          source: AIRCRAFT_SOURCE,
          filter: ['==', ['get', 'group'], group],
          layout: {
            'icon-image': AIRCRAFT_ICON_ID[group],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 4, s * 0.75, 8, s, 12, s * 1.4],
            'icon-rotate': ['get', 'track'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': colors[group],
            'icon-halo-color': halo,
            'icon-halo-width': 1.2,
            // Taxiing aircraft fade back: they are not what the sky looks like.
            'icon-opacity': ['case', ['get', 'onGround'], 0.5, 1],
          },
        });
        // Callsign from regional zoom, plus the flight level once there is room.
        m.addLayer({
          id: label,
          type: 'symbol',
          source: AIRCRAFT_SOURCE,
          filter: ['all', ['==', ['get', 'group'], group], ['!=', ['get', 'label'], '']],
          minzoom: 6.5,
          layout: {
            'text-field': [
              'step', ['zoom'],
              ['get', 'label'],
              8.5, ['concat', ['get', 'label'], '\n', ['get', 'alt']],
            ],
            'text-font': ['Montserrat Regular'],
            'text-size': 10.5,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-optional': true,
          },
          paint: {
            'text-color': colors[group],
            'text-halo-color': halo,
            'text-halo-width': 1.3,
          },
        });
        attachAircraftInteractions(icon);
      }
    };

    // The frame loop: project every aircraft forward from its last fix, and
    // keep the selection ring and trail glued to the selected one.
    const render = () => {
      if (!styleReadyRef.current) return;
      const now = Date.now() + clockOffsetRef.current;
      const src = m.getSource(AIRCRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      src?.setData(toAircraftGeoJSON(aircraftRef.current, now));

      const selected = selectedRef.current ? aircraftByHex.current.get(selectedRef.current) : undefined;
      const position = selected ? livePosition(selected, now) : null;
      (m.getSource(SELECTED_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
        position
          ? { type: 'Feature', geometry: { type: 'Point', coordinates: position }, properties: {} }
          : EMPTY_FC
      );
      (m.getSource(TRAIL_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
        selectedRef.current
          ? toTrailGeoJSON(
              trailRef.current,
              selected && position
                ? { position, altitudeFt: selected.onGround ? 0 : selected.altitudeFt }
                : null
            )
          : EMPTY_FC
      );
    };

    // Everything a style owns: icons, then sources and layers bottom-up —
    // airports under the trail, the trail under the aircraft. Runs on first
    // load and after each theme swap; safe to repeat.
    const installLayers = () => {
      loadMapIcons(m).then(() => {
        if (!styleReadyRef.current) return;
        installAirports();
        installSelection();
        installAircraft();
        applyVisibility(m, visibilityRef.current);
        render();
      });
    };
    installLayersRef.current = installLayers;

    const fetchAircraft = async () => {
      try {
        const res = await fetch('/api/ilma/aircraft');
        if (!res.ok) return; // cold backend — the next poll will have it
        const snap: Snapshot = await res.json();
        clockOffsetRef.current = snap.time - Date.now();
        aircraftRef.current = snap.aircraft;
        aircraftByHex.current = new globalThis.Map(snap.aircraft.map(a => [a.hex, a]));
        callbacksRef.current.onAircraftUpdate(snap.aircraft);
        render();
      } catch (err) {
        console.error('Failed to fetch aircraft', err);
      }
    };

    const fetchAirports = async () => {
      if (airportsRef.current.length > 0) return;
      try {
        const res = await fetch('/api/ilma/airports');
        if (!res.ok) return;
        const airports: Airport[] = await res.json();
        airportsRef.current = airports;
        airportsByIcao.current = new globalThis.Map(airports.map(a => [a.icao, a]));
        callbacksRef.current.onAirportsUpdate?.(airports);
        (m.getSource(AIRPORTS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
          toAirportsGeoJSON(airports)
        );
      } catch (err) {
        console.error('Failed to fetch airports', err);
      }
    };

    const fetchTrail = async () => {
      const hex = selectedRef.current;
      if (!hex) return;
      try {
        const res = await fetch(`/api/ilma/aircraft/${encodeURIComponent(hex)}/trail`);
        if (!res.ok) return;
        const points: TrailPoint[] = await res.json();
        // The selection may have moved on while this was in flight.
        if (selectedRef.current === hex) trailRef.current = points;
      } catch (err) {
        console.error('Failed to fetch trail', err);
      }
    };
    fetchTrailRef.current = fetchTrail;

    const intervalIds: ReturnType<typeof setInterval>[] = [];

    m.on('load', () => {
      styleReadyRef.current = true;
      installLayers();
      fetchAirports();
      fetchAircraft();
      if (selectedRef.current) fetchTrail();

      // Registered once — a theme swap reinstalls layers, not timers.
      intervalIds.push(
        setInterval(() => {
          fetchAircraft();
          fetchTrail();
        }, POLL_MS)
      );
      // Static register; this retry exists only to recover from a cold backend.
      intervalIds.push(setInterval(fetchAirports, 60000));
      intervalIds.push(
        setInterval(() => {
          if (document.visibilityState === 'visible') render();
        }, FRAME_MS)
      );
    });

    return () => {
      intervalIds.forEach(clearInterval);
      installLayersRef.current = null;
      fetchTrailRef.current = null;
      hoverPopup.remove();
      m.remove();
      map.current = null;
    };
  }, []);

  return (
    <>
      <div ref={mapContainer} className="map-container" />
      <LocateControl getMap={() => map.current} />
    </>
  );
};

export default Map;
