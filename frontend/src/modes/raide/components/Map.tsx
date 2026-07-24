import React, { useEffect, useRef } from 'react';
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  type Train,
  type StationMeta,
  type TrainGroup,
  trainGroup,
  trainLabel,
  trainTitle,
  groupColors,
  delayText,
  delaySeverity,
  DELAY_RING_COLORS,
  STATION_COLORS,
} from '../lib/trains';
import { type LayerKey, LAYER_ORDER, type LayerVisibility } from '../lib/layers';
import { type Theme, BASEMAP_STYLES, MARKER_STROKE, TRACK_COLORS } from '../lib/theme';
import { loadMapIcons, TRAIN_ICON_ID, STATION_PIN_ICON_ID, CANCELLED_BADGE_ICON_ID } from '../lib/mapIcons';

interface MapProps {
  onSelectTrain: (train: Train) => void;
  onSelectStation: (station: StationMeta) => void;
  /** Fired after every poll so App can refresh the selected train and counts. */
  onTrainsUpdate: (trains: Train[]) => void;
  /** Layer/category visibility, owned by the FilterPanel in App. */
  visibility: LayerVisibility;
  theme: Theme;
}

const TRAINS_SOURCE = 'trains';
const STATIONS_SOURCE = 'stations';
const STATIONS_LAYER = 'stations-circles';
const STATIONS_MAJOR_LAYER = 'stations-major';
// The rail overlay reads from the CARTO basemap's own vector tiles (source id
// "carto", OpenMapTiles "transportation" layer, class "rail") â€” no extra data.
const BASEMAP_SOURCE = 'carto';
const BASEMAP_TRANSPORT_LAYER = 'transportation';
const RAIL_LAYER = 'rail-tracks';

const TRAIN_GROUPS: TrainGroup[] = ['longDistance', 'commuter', 'cargo', 'other'];

// Per group: colored puck (base), delay ring (warn/bad only), category icon,
// cancelled badge, text label. Every id gets built from the group name so a
// toggle can hide the whole stack without touching the shared source.
const trainLayerIds = (group: TrainGroup) => ({
  circle: `trains-${group}`,
  ring: `trains-${group}-ring`,
  icon: `trains-${group}-icon`,
  cancelled: `trains-${group}-cancelled`,
  label: `trains-${group}-label`,
});

// Each category group gets its own layer stack so the toggles can hide one
// group without touching the shared source.
const LAYER_IDS: Record<LayerKey, string[]> = {
  longDistance: Object.values(trainLayerIds('longDistance')),
  commuter: Object.values(trainLayerIds('commuter')),
  cargo: Object.values(trainLayerIds('cargo')),
  other: Object.values(trainLayerIds('other')),
  stations: [STATIONS_LAYER, STATIONS_MAJOR_LAYER],
  tracks: [RAIL_LAYER],
};

const trainKey = (t: Pick<Train, 'trainNumber' | 'departureDate'>) =>
  `${t.trainNumber}/${t.departureDate}`;

function toTrainsGeoJSON(trains: Train[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: trains.map(train => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [train.longitude, train.latitude] },
      properties: {
        key: trainKey(train),
        group: trainGroup(train.category),
        label: trainLabel(train),
        cancelled: train.cancelled,
        hasDelay: train.hasDelay,
        delayState: delaySeverity(train.delayMin, train.hasDelay),
      },
    })),
  };
}

function toStationsGeoJSON(stations: StationMeta[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    // Freight yards and technical stops would double the marker count without
    // ever having a departure board â€” passenger stations only.
    features: stations
      .filter(s => s.passenger)
      .map(station => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
        properties: { code: station.code, name: station.name, major: station.major },
      })),
  };
}

function setLayersVisible(m: maplibregl.Map, layerIds: string[], visible: boolean) {
  for (const id of layerIds) {
    if (m.getLayer(id)) {
      m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

// Hover popups are mouse-only: on a touch screen `mousemove` fires on tap and
// leaves the popup stranded over the map with no pointer to move away.
const HOVER_CAPABLE = !window.matchMedia('(pointer: coarse)').matches;

const Map: React.FC<MapProps> = ({
  onSelectTrain,
  onSelectStation,
  onTrainsUpdate,
  visibility,
  theme,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const trainsByKey = useRef<globalThis.Map<string, Train>>(new globalThis.Map());
  const stationsByCode = useRef<globalThis.Map<string, StationMeta>>(new globalThis.Map());
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  // Latest visibility, readable from the mount effect's fetch closures so a
  // layer added after the user toggled it off still starts hidden.
  const visibilityRef = useRef(visibility);
  // Same trick for the theme: the fetch closures bake paint colors in at
  // add-time, so they read the current theme rather than the mounted one.
  const themeRef = useRef(theme);
  // Theme whose basemap style is currently loaded, so the effect below can tell
  // a real switch from its own first run (the map mounts with the right style).
  const styleThemeRef = useRef(theme);
  // Set by the mount effect; lets the theme effect rebuild the layers a
  // setStyle() has just discarded.
  const installLayersRef = useRef<(() => void) | null>(null);
  // False while a style swap is in flight: a poll that lands mid-swap must not
  // add its source to a style that is about to be thrown away.
  const styleReadyRef = useRef(false);

  // Swap the basemap when the theme changes. setStyle() throws away every
  // custom source and layer, so the install has to run again once the new
  // style is ready â€” layer visibility survives via visibilityRef.
  useEffect(() => {
    themeRef.current = theme;
    const m = map.current;
    if (!m || styleThemeRef.current === theme) return;
    styleThemeRef.current = theme;
    styleReadyRef.current = false;
    m.setStyle(BASEMAP_STYLES[theme]);

    // Whichever of these lands first means the new style is ready to take
    // sources again. isStyleLoaded() is deliberately not consulted: it still
    // reports false at this point (tiles are outstanding) even though
    // addSource/addLayer are already accepted.
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

  // Apply visibility (from App) to the map whenever it changes. Layers not yet
  // added are skipped and picked up when their fetch adds them.
  useEffect(() => {
    visibilityRef.current = visibility;
    const m = map.current;
    if (!m) return;
    for (const key of LAYER_ORDER) {
      setLayersVisible(m, LAYER_IDS[key], visibility[key]);
    }
  }, [visibility]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLES[themeRef.current],
      center: [25.75, 62.2], // roughly the middle of the rail network
      zoom: 5.2,
    });
    map.current = m;
    // Dev-only escape hatch for driving the map from the console / test tools.
    if (import.meta.env.DEV) (window as unknown as { __map?: maplibregl.Map }).__map = m;

    hoverPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    // Layers are re-added after every theme swap, but map event listeners
    // survive setStyle() â€” without this guard each swap would stack another
    // copy of every handler (double popups, double flyTo).
    const boundLayers = new Set<string>();
    const bindOnce = (layerId: string, bind: () => void) => {
      if (boundLayers.has(layerId)) return;
      boundLayers.add(layerId);
      bind();
    };

    const buildTrainHoverHTML = (train: Train): string => {
      const route = train.dest ? `${train.origin} â†’ ${train.dest}<br/>` : '';
      return (
        `<strong>${trainTitle(train)}</strong><br/>` +
        route +
        `${train.speed} km/h Â· ${delayText(train.delayMin, train.hasDelay)}`
      );
    };

    const attachTrainInteractions = (layerId: string) => bindOnce(layerId, () => {
      m.on('mouseenter', layerId, () => {
        m.getCanvas().style.cursor = 'pointer';
      });

      m.on('mouseleave', layerId, () => {
        m.getCanvas().style.cursor = '';
        hoverPopupRef.current?.remove();
      });

      if (HOVER_CAPABLE) m.on('mousemove', layerId, e => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as { key: string };
        const train = trainsByKey.current.get(props.key);
        if (!train) return;

        hoverPopupRef.current
          ?.setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(buildTrainHoverHTML(train))
          .addTo(m);
      });

      m.on('click', layerId, e => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature) return;
        const props = feature.properties as { key: string };
        const train = trainsByKey.current.get(props.key);
        if (!train) return;

        onSelectTrain(train);
        m.flyTo({
          center: [train.longitude, train.latitude],
          zoom: Math.max(m.getZoom(), 9),
          essential: true,
        });
      });
    });

    // Emphasize the railway lines the basemap draws too faintly. The geometry
    // comes from the basemap's own vector source, so this is a paint overlay
    // with no data of its own. Inserted below the first label layer so track
    // lines never cover place names, and re-run after each theme swap (setStyle
    // discards it along with our other layers).
    const installRailLayer = () => {
      if (!styleReadyRef.current || !m.getSource(BASEMAP_SOURCE)) return;
      if (m.getLayer(RAIL_LAYER)) {
        setLayersVisible(m, LAYER_IDS.tracks, visibilityRef.current.tracks);
        return;
      }
      const firstSymbol = m.getStyle().layers?.find(l => l.type === 'symbol')?.id;
      m.addLayer(
        {
          id: RAIL_LAYER,
          type: 'line',
          source: BASEMAP_SOURCE,
          'source-layer': BASEMAP_TRANSPORT_LAYER,
          filter: ['==', ['get', 'class'], 'rail'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': TRACK_COLORS[themeRef.current],
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 1.8, 12, 3.2, 16, 6],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 0.85],
          },
        },
        firstSymbol,
      );
      setLayersVisible(m, LAYER_IDS.tracks, visibilityRef.current.tracks);
    };

    const attachStationInteractions = (layerId: string) => bindOnce(layerId, () => {
      m.on('mouseenter', layerId, () => {
        m.getCanvas().style.cursor = 'pointer';
      });

      m.on('mouseleave', layerId, () => {
        m.getCanvas().style.cursor = '';
        hoverPopupRef.current?.remove();
      });

      if (HOVER_CAPABLE) m.on('mousemove', layerId, e => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as { code: string; name: string };
        hoverPopupRef.current
          ?.setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(`<strong>${props.name}</strong>`)
          .addTo(m);
      });

      m.on('click', layerId, e => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature) return;
        const props = feature.properties as { code: string };
        const station = stationsByCode.current.get(props.code);
        if (!station) return;

        onSelectStation(station);
        m.flyTo({
          center: [station.longitude, station.latitude],
          zoom: Math.max(m.getZoom(), 10),
          essential: true,
        });
      });
    });

    const fetchStations = async () => {
      try {
        const res = await fetch('/api/raide/stations');
        if (!res.ok) return; // cold backend â€” the next poll will have it
        const stations: StationMeta[] = await res.json();

        stationsByCode.current = new globalThis.Map(stations.map(s => [s.code, s]));

        const geojson = toStationsGeoJSON(stations);
        const source = m.getSource(STATIONS_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        // A theme switch may be mid-flight; the reinstall that follows it will
        // re-add this layer against the new style.
        if (!styleReadyRef.current) return;

        m.addSource(STATIONS_SOURCE, { type: 'geojson', data: geojson });
        // Stopping points/turnouts: small dot, same as before.
        m.addLayer({
          id: STATIONS_LAYER,
          type: 'circle',
          source: STATIONS_SOURCE,
          filter: ['==', ['get', 'major'], false],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 9, 4, 12, 6],
            'circle-color': STATION_COLORS[themeRef.current],
            'circle-stroke-width': 1,
            'circle-stroke-color': MARKER_STROKE[themeRef.current],
            'circle-opacity': 0.75,
          },
        });
        // Full stations: bigger pin icon, so they read as more important stops.
        m.addLayer({
          id: STATIONS_MAJOR_LAYER,
          type: 'symbol',
          source: STATIONS_SOURCE,
          filter: ['==', ['get', 'major'], true],
          layout: {
            'icon-image': STATION_PIN_ICON_ID,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 9, 0.55, 12, 0.75],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
          },
          paint: {
            'icon-color': STATION_COLORS[themeRef.current],
            'icon-halo-color': MARKER_STROKE[themeRef.current],
            'icon-halo-width': 1.2,
          },
        });
        setLayersVisible(m, LAYER_IDS.stations, visibilityRef.current.stations);

        attachStationInteractions(STATIONS_LAYER);
        attachStationInteractions(STATIONS_MAJOR_LAYER);
      } catch (err) {
        console.error('Failed to fetch stations', err);
      }
    };

    const fetchTrains = async () => {
      try {
        const res = await fetch('/api/raide/trains');
        if (!res.ok) return;
        const trains: Train[] = await res.json();

        trainsByKey.current = new globalThis.Map(trains.map(t => [trainKey(t), t]));
        onTrainsUpdate(trains);

        const geojson = toTrainsGeoJSON(trains);
        const source = m.getSource(TRAINS_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        if (!styleReadyRef.current) return;

        m.addSource(TRAINS_SOURCE, { type: 'geojson', data: geojson });
        const colors = groupColors(themeRef.current);
        for (const group of TRAIN_GROUPS) {
          const { circle, ring, icon, cancelled, label } = trainLayerIds(group);
          m.addLayer({
            id: circle,
            type: 'circle',
            source: TRAINS_SOURCE,
            filter: ['==', ['get', 'group'], group],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 9, 8, 12, 11],
              'circle-color': colors[group],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': MARKER_STROKE[themeRef.current],
              'circle-opacity': ['case', ['==', ['get', 'hasDelay'], false], 0.45, 0.9],
            },
          });
          // Delay ring: only drawn once a train is running late enough to flag â€”
          // an on-time train doesn't need a badge.
          m.addLayer({
            id: ring,
            type: 'circle',
            source: TRAINS_SOURCE,
            filter: [
              'all',
              ['==', ['get', 'group'], group],
              ['in', ['get', 'delayState'], ['literal', ['warn', 'bad']]],
            ],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 9, 11, 12, 14],
              'circle-color': 'rgba(0,0,0,0)',
              'circle-stroke-width': 2,
              'circle-stroke-color': [
                'match',
                ['get', 'delayState'],
                'bad',
                DELAY_RING_COLORS.bad,
                DELAY_RING_COLORS.warn,
              ],
            },
          });
          // Category pictogram, drawn on top of the puck.
          m.addLayer({
            id: icon,
            type: 'symbol',
            source: TRAINS_SOURCE,
            filter: ['==', ['get', 'group'], group],
            layout: {
              'icon-image': TRAIN_ICON_ID[group],
              'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.22, 9, 0.32, 12, 0.42],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-color': '#ffffff',
              'icon-opacity': ['case', ['==', ['get', 'hasDelay'], false], 0.45, 0.9],
            },
          });
          // Cancelled badge: small corner overlay, independent of delay state.
          m.addLayer({
            id: cancelled,
            type: 'symbol',
            source: TRAINS_SOURCE,
            filter: ['all', ['==', ['get', 'group'], group], ['==', ['get', 'cancelled'], true]],
            layout: {
              'icon-image': CANCELLED_BADGE_ICON_ID,
              'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 9, 0.5, 12, 0.6],
              'icon-offset': [18, -18],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
          m.addLayer({
            id: label,
            type: 'symbol',
            source: TRAINS_SOURCE,
            filter: ['==', ['get', 'group'], group],
            minzoom: 7,
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['Montserrat Regular'],
              'text-size': 11,
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': colors[group],
              'text-halo-color': themeRef.current === 'dark' ? '#000000' : '#ffffff',
              'text-halo-width': 1.2,
            },
          });
          attachTrainInteractions(circle);
          setLayersVisible(m, LAYER_IDS[group], visibilityRef.current[group]);
        }
      } catch (err) {
        console.error('Failed to fetch trains', err);
      }
    };

    const intervalIds: ReturnType<typeof setInterval>[] = [];

    // Everything a style owns: every source, layer and registered icon image.
    // Runs on first load and again after each theme swap, since setStyle()
    // drops the lot. The fetch helpers re-add whatever is missing and only
    // setData when it survived, so this is safe to call repeatedly.
    const installLayers = () => {
      // Rail lines first so they sit beneath the station and train markers.
      installRailLayer();
      // Icons next (layers reference them by id), then stations before
      // trains so stations sit below the train markers regardless of fetch
      // timing.
      loadMapIcons(m).then(() => {
        fetchStations().then(() => {
          fetchTrains();
        });
      });
    };
    installLayersRef.current = installLayers;

    m.on('load', () => {
      styleReadyRef.current = true;
      installLayers();

      // Registered once â€” a theme swap reinstalls layers, not timers.
      intervalIds.push(setInterval(fetchTrains, 10000));
      // The station register changes a few times a year; this refresh exists
      // mostly to recover from a cold backend at first load.
      intervalIds.push(setInterval(fetchStations, 600000));
    });

    return () => {
      intervalIds.forEach(clearInterval);
      installLayersRef.current = null;
      m.remove();
      map.current = null;
    };
  }, []);

  return <div ref={mapContainer} className="map-container" />;
};

export default Map;
