import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature } from 'geojson';
import { lerpAngle } from '../lib/lerp';
import { deadReckon } from '../lib/geo';
import { categorize, CATEGORY_COLORS, isStationary, ALL_CATEGORIES } from '../lib/shipTypes';
import type { Vessel, Port, SeaStateFeature, AtonFaultFeature } from '../types';

const STYLE_URLS = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

// Gulf of Finland + Archipelago Sea + Bothnia in one view
const INITIAL_CENTER: [number, number] = [23.5, 60.5];
const INITIAL_ZOOM = 5.5;

// Cap dead-reckoning projection so a stale fix doesn't sail off the map
const MAX_PROJECT_SECONDS = 180;
// Rendering positions ease toward the predicted position with this time constant (ms)
const SMOOTHING_TAU_MS = 600;
// setData at most ~30fps — 700+ features every frame is wasted work at 60fps
const SET_DATA_INTERVAL_MS = 33;

interface RenderPos {
  lat: number;
  lng: number;
  hdg: number;
}

interface TargetPos {
  lat: number;
  lng: number;
  sog: number;
  cog: number;
  hdg: number | null;
  stationary: boolean;
  color: string;
  icon: string;
  name: string;
  ts: number;
  receivedAt: number; // performance.now() when this fix arrived
}

interface MapProps {
  vessels: Record<string, Vessel>;
  selectedMmsi: number | null;
  onSelectVessel: (mmsi: number | null) => void;
  ports: Port[];
  showPorts: boolean;
  selectedPortLocode: string | null;
  onSelectPort: (port: Port) => void;
  buoys: SeaStateFeature[];
  showBuoys: boolean;
  atonFaults: AtonFaultFeature[];
  showAton: boolean;
  mapTheme: 'light' | 'dark';
  isFollowing: boolean;
  onDisableFollowing: () => void;
  onBackgroundClick: () => void;
}

/** Draws a ship-arrow marker pointing north, returns ImageData for map.addImage. */
function makeVesselImage(color: string): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Pointed hull with a notched stern, centered on the canvas
  ctx.beginPath();
  ctx.moveTo(24, 6); // bow
  ctx.lineTo(36, 40);
  ctx.lineTo(24, 33); // stern notch
  ctx.lineTo(12, 40);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(2, 11, 23, 0.85)';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** Small warning triangle for AtoN fault markers. */
function makeWarningImage(): ImageData {
  const size = 36;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.beginPath();
  ctx.moveTo(18, 4);
  ctx.lineTo(33, 31);
  ctx.lineTo(3, 31);
  ctx.closePath();
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(2, 11, 23, 0.85)';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.fillStyle = '#0b1220';
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 18, 21);

  return ctx.getImageData(0, 0, size, size);
}

export function Map({
  vessels,
  selectedMmsi,
  onSelectVessel,
  ports,
  showPorts,
  selectedPortLocode,
  onSelectPort,
  buoys,
  showBuoys,
  atonFaults,
  showAton,
  mapTheme,
  isFollowing,
  onDisableFollowing,
  onBackgroundClick,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Everything the rAF loop and event handlers read lives in refs so the map
  // never re-initializes and position updates never re-render React.
  const targetsRef = useRef<Record<string, TargetPos>>({});
  const renderRef = useRef<Record<string, RenderPos>>({});
  const selectedRef = useRef<number | null>(selectedMmsi);
  const followRef = useRef<boolean>(isFollowing);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastSetDataRef = useRef<number>(0);

  // Bumped every time a style finishes loading (initial + theme swaps) so the
  // overlay-data effects below re-apply their data to the fresh style.
  const [styleEpoch, setStyleEpoch] = useState(0);

  useEffect(() => {
    selectedRef.current = selectedMmsi;
  }, [selectedMmsi]);

  useEffect(() => {
    followRef.current = isFollowing;
  }, [isFollowing]);

  // Ingest new vessel targets. receivedAt only advances when the fix's ts
  // changed, so dead reckoning projects from the true fix age.
  useEffect(() => {
    const now = performance.now();
    const targets = targetsRef.current;
    const next: Record<string, TargetPos> = {};

    for (const [id, v] of Object.entries(vessels)) {
      const prev = targets[id];
      const cat = categorize(v.shipType);
      next[id] = {
        lat: v.lat,
        lng: v.lng,
        sog: v.sog,
        cog: v.cog,
        hdg: v.hdg ?? null,
        stationary: isStationary(v.sog, v.navStat),
        color: CATEGORY_COLORS[cat],
        icon: `vessel-${cat}`,
        name: v.name ?? '',
        ts: v.ts,
        receivedAt: prev && prev.ts === v.ts ? prev.receivedAt : now,
      };
    }

    targetsRef.current = next;

    // Drop render state for vessels that disappeared
    const render = renderRef.current;
    for (const id of Object.keys(render)) {
      if (!next[id]) delete render[id];
    }
  }, [vessels]);

  // The interpolation loop: dead-reckon moving vessels between fixes and ease
  // the rendered position toward the prediction.
  useEffect(() => {
    const tick = () => {
      animationFrameRef.current = requestAnimationFrame(tick);

      const map = mapRef.current;
      if (!map) return;
      const source = map.getSource('vessels') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      const now = performance.now();
      const dtMs = lastFrameRef.current ? now - lastFrameRef.current : 16;
      lastFrameRef.current = now;

      if (now - lastSetDataRef.current < SET_DATA_INTERVAL_MS) return;
      lastSetDataRef.current = now;

      const k = 1 - Math.exp(-dtMs / SMOOTHING_TAU_MS);
      const render = renderRef.current;
      const selected = selectedRef.current;
      const features: Feature[] = [];

      for (const [id, target] of Object.entries(targetsRef.current)) {
        const desiredHdg = target.hdg ?? target.cog;
        let r = render[id];
        if (!r) {
          r = { lat: target.lat, lng: target.lng, hdg: desiredHdg };
          render[id] = r;
        } else {
          let predLat = target.lat;
          let predLng = target.lng;
          if (!target.stationary) {
            const age = Math.min((now - target.receivedAt) / 1000, MAX_PROJECT_SECONDS);
            const p = deadReckon(target.lat, target.lng, target.sog, target.cog, age);
            predLat = p.lat;
            predLng = p.lng;
          }
          r.lat += (predLat - r.lat) * k;
          r.lng += (predLng - r.lng) * k;
          r.hdg = lerpAngle(r.hdg, desiredHdg, k);
        }

        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: {
            mmsi: Number(id),
            color: target.color,
            icon: target.icon,
            hdg: r.hdg,
            stationary: target.stationary,
            name: target.name,
            selected: selected !== null && Number(id) === selected,
          },
        });
      }

      source.setData({ type: 'FeatureCollection', features });

      // Chase cam: keep the followed vessel centered
      if (followRef.current && selected !== null) {
        const r = render[String(selected)];
        if (r) {
          map.jumpTo({ center: [r.lng, r.lat] });
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Map initialization — runs exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS[mapTheme],
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    if (import.meta.env.DEV) {
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      'top-right'
    );

    map.on('load', () => {
      setupMapContent(map);
      setStyleEpoch((n) => n + 1);
    });

    // Any manual drag breaks follow mode
    map.on('dragstart', () => onDisableFollowingRef.current());

    registerInteractions(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDisableFollowingRef = useRef(onDisableFollowing);
  const onSelectVesselRef = useRef(onSelectVessel);
  const onSelectPortRef = useRef(onSelectPort);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  useEffect(() => {
    onDisableFollowingRef.current = onDisableFollowing;
    onSelectVesselRef.current = onSelectVessel;
    onSelectPortRef.current = onSelectPort;
    onBackgroundClickRef.current = onBackgroundClick;
  }, [onDisableFollowing, onSelectVessel, onSelectPort, onBackgroundClick]);

  const buoyPopupRef = useRef<maplibregl.Popup | null>(null);

  /** Click + hover wiring. Registered once; guards against missing layers. */
  function registerInteractions(map: maplibregl.Map) {
    const interactive = ['vessels-moving', 'vessels-stationary', 'ports-layer', 'buoys-layer', 'aton-layer'];

    map.on('click', (e) => {
      const layers = interactive.filter((l) => map.getLayer(l));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length === 0) {
        buoyPopupRef.current?.remove();
        onBackgroundClickRef.current();
        return;
      }

      const hit = hits[0];
      const props = hit.properties ?? {};
      switch (hit.layer.id) {
        case 'vessels-moving':
        case 'vessels-stationary':
          onSelectVesselRef.current(Number(props.mmsi));
          break;
        case 'ports-layer':
          onSelectPortRef.current({
            locode: String(props.locode),
            name: String(props.name),
            lat: Number(props.lat),
            lng: Number(props.lng),
          });
          break;
        case 'buoys-layer':
        case 'aton-layer': {
          buoyPopupRef.current?.remove();
          buoyPopupRef.current = new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
            .setLngLat(e.lngLat)
            .setHTML(String(props.popupHtml ?? ''))
            .addTo(map);
          break;
        }
      }
    });

    map.on('mousemove', (e) => {
      const layers = interactive.filter((l) => map.getLayer(l));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      map.getCanvas().style.cursor = hits.length > 0 ? 'pointer' : '';
    });
  }

  /** (Re)creates images, sources and layers — called on load and after theme swaps. */
  function setupMapContent(map: maplibregl.Map) {
    for (const cat of ALL_CATEGORIES) {
      const name = `vessel-${cat}`;
      if (!map.hasImage(name)) {
        map.addImage(name, makeVesselImage(CATEGORY_COLORS[cat]));
      }
    }
    if (!map.hasImage('aton-warning')) {
      map.addImage('aton-warning', makeWarningImage());
    }

    const empty = { type: 'FeatureCollection' as const, features: [] };
    if (!map.getSource('vessels')) map.addSource('vessels', { type: 'geojson', data: empty });
    if (!map.getSource('ports')) map.addSource('ports', { type: 'geojson', data: empty });
    if (!map.getSource('buoys')) map.addSource('buoys', { type: 'geojson', data: empty });
    if (!map.getSource('aton')) map.addSource('aton', { type: 'geojson', data: empty });

    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const labelColor = dark ? '#cbd5e1' : '#334155';
    const labelHalo = dark ? '#020b17' : '#f8fafc';

    if (!map.getLayer('ports-layer')) {
      map.addLayer({
        id: 'ports-layer',
        type: 'circle',
        source: 'ports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 6],
          'circle-color': 'rgba(56, 189, 248, 0.25)',
          'circle-stroke-color': '#38bdf8',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'ports-labels',
        type: 'symbol',
        source: 'ports',
        minzoom: 7,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': '#38bdf8',
          'text-halo-color': labelHalo,
          'text-halo-width': 1,
        },
      });
    }

    if (!map.getLayer('buoys-layer')) {
      map.addLayer({
        id: 'buoys-layer',
        type: 'circle',
        source: 'buoys',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 6],
          'circle-color': 'rgba(253, 203, 110, 0.3)',
          'circle-stroke-color': '#fdcb6e',
          'circle-stroke-width': 1.5,
        },
      });
    }

    if (!map.getLayer('aton-layer')) {
      map.addLayer({
        id: 'aton-layer',
        type: 'symbol',
        source: 'aton',
        layout: {
          'icon-image': 'aton-warning',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 0.7],
          'icon-allow-overlap': true,
        },
      });
    }

    if (!map.getLayer('vessel-selection')) {
      map.addLayer({
        id: 'vessel-selection',
        type: 'circle',
        source: 'vessels',
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 11, 12, 20],
          'circle-color': 'rgba(45, 212, 191, 0.15)',
          'circle-stroke-color': '#2dd4bf',
          'circle-stroke-width': 2,
        },
      });
    }

    if (!map.getLayer('vessels-stationary')) {
      map.addLayer({
        id: 'vessels-stationary',
        type: 'circle',
        source: 'vessels',
        filter: ['==', ['get', 'stationary'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 4.5, 14, 7],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-stroke-color': 'rgba(2, 11, 23, 0.6)',
          'circle-stroke-width': 1,
        },
      });
    }

    if (!map.getLayer('vessels-moving')) {
      map.addLayer({
        id: 'vessels-moving',
        type: 'symbol',
        source: 'vessels',
        filter: ['==', ['get', 'stationary'], false],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-rotate': ['get', 'hdg'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 9, 0.75, 14, 1.1],
        },
      });
    }

    if (!map.getLayer('vessel-labels')) {
      map.addLayer({
        id: 'vessel-labels',
        type: 'symbol',
        source: 'vessels',
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': labelColor,
          'text-halo-color': labelHalo,
          'text-halo-width': 1,
        },
      });
    }
  }

  // Theme swap: setStyle wipes sources/layers/images, so rebuild content once
  // the new style is in.
  const themeRef = useRef(mapTheme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === mapTheme) return;
    themeRef.current = mapTheme;

    map.setStyle(STYLE_URLS[mapTheme]);
    map.once('styledata', () => {
      setupMapContent(map);
      setStyleEpoch((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTheme]);

  // Overlay data + visibility effects (re-run after every style (re)load)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleEpoch === 0) return;
    const source = map.getSource('ports') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: ports.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { locode: p.locode, name: p.name, lat: p.lat, lng: p.lng },
      })),
    });
  }, [ports, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleEpoch === 0) return;
    const source = map.getSource('buoys') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: buoys
        .filter((b) => b.geometry?.coordinates)
        .map((b) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: b.geometry!.coordinates },
          properties: {
            popupHtml: buoyPopupHtml(b),
          },
        })),
    });
  }, [buoys, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleEpoch === 0) return;
    const source = map.getSource('aton') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: atonFaults
        .filter((f) => f.geometry?.coordinates)
        .map((f) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: f.geometry!.coordinates },
          properties: {
            popupHtml: atonPopupHtml(f),
          },
        })),
    });
  }, [atonFaults, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleEpoch === 0) return;
    const vis = (layer: string, on: boolean) => {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');
      }
    };
    vis('ports-layer', showPorts);
    vis('ports-labels', showPorts);
    vis('buoys-layer', showBuoys);
    vis('aton-layer', showAton);
  }, [showPorts, showBuoys, showAton, styleEpoch]);

  // Fly to a selected port
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPortLocode) return;
    const port = ports.find((p) => p.locode === selectedPortLocode);
    if (port) {
      map.flyTo({ center: [port.lng, port.lat], zoom: Math.max(map.getZoom(), 10), duration: 800 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPortLocode]);

  // Fly to the selected vessel when following starts
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isFollowing || selectedMmsi === null) return;
    const r = renderRef.current[String(selectedMmsi)];
    if (r) {
      map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 11), duration: 800 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowing]);

  return <div ref={containerRef} className="map-container" />;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buoyPopupHtml(b: SeaStateFeature): string {
  const p = b.properties;
  const rows: string[] = [];
  if (p.seaState) rows.push(`<div><span>Sea state</span><b>${esc(p.seaState)}</b></div>`);
  if (p.trend) rows.push(`<div><span>Trend</span><b>${esc(p.trend)}</b></div>`);
  if (p.windWaveDir !== null) rows.push(`<div><span>Wave dir</span><b>${p.windWaveDir}&deg;</b></div>`);
  if (p.temperature !== null) rows.push(`<div><span>Temp</span><b>${p.temperature}&deg;C</b></div>`);
  const updated = p.lastUpdate ? new Date(p.lastUpdate).toLocaleString() : '';
  return `<div class="marine-popup"><h4>${esc(p.siteName)}</h4>${rows.join('')}<small>${esc(updated)}</small></div>`;
}

function atonPopupHtml(f: AtonFaultFeature): string {
  const p = f.properties;
  return `<div class="marine-popup"><h4>${esc(p.aton_name_fi)}</h4>` +
    `<div><span>Fault</span><b>${esc(p.type)}</b></div>` +
    `<div><span>Type</span><b>${esc(p.aton_type)}</b></div>` +
    `<div><span>Fairway</span><b>${esc(p.fairway_name_fi)}</b></div>` +
    `<small>Since ${new Date(p.entry_timestamp).toLocaleDateString()}</small></div>`;
}
