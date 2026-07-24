import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed } from 'lucide-react';
import {
  type Station,
  type DirectionalStatus,
  directionalStatuses,
  stationVolume,
} from '../lib/traffic';
import { type ParkingFacility, parkingLevel } from '../lib/parking';
import { type WeathercamStation } from '../lib/weathercam';
import { MARKER_ICONS, registerMarkerIcons, registerSpeedLimitIcon } from '../lib/markerIcons';
import { type VariableSpeedSign, speedSignPopupHTML } from '../lib/speedLimits';
import { type ChargingStation, chargingLevel, availabilityText } from '../lib/charging';
import { type LayerKey, LAYER_ORDER, type LayerVisibility, poiColors } from '../lib/layers';
import { type Theme, BASEMAP_STYLES } from '../lib/theme';

interface MapProps {
  onSelectStation: (station: Station) => void;
  onSelectFacility: (facility: ParkingFacility) => void;
  onSelectCamera: (camera: WeathercamStation) => void;
  onSelectCharger: (charger: ChargingStation) => void;
  visibility: LayerVisibility;
  theme: Theme;
}

const STATIONS_SOURCE = 'tms-stations';
const STATIONS_LAYER = 'tms-stations-circles';
const ROADWORKS_SOURCE = 'roadworks';
const INCIDENTS_SOURCE = 'incidents';
const PARKING_SOURCE = 'parking-facilities';
const PARKING_LAYER = 'parking-facilities-circles';
const WEATHERCAM_SOURCE = 'weathercams';
const WEATHERCAM_LAYER = 'weathercams-circles';
const CHARGING_SOURCE = 'charging-stations';
const CHARGING_LAYER = 'charging-stations-circles';
const SPEEDLIMIT_SOURCE = 'speed-limits';
const SPEEDLIMIT_LAYER = 'speed-limits-signs';

const LAYER_IDS: Record<LayerKey, string[]> = {
  stations: [STATIONS_LAYER],
  roadworks: ['roadworks-line', 'roadworks-point'],
  incidents: ['incidents-line', 'incidents-point'],
  speedlimits: [SPEEDLIMIT_LAYER],
  parking: [PARKING_LAYER],
  weathercams: [WEATHERCAM_LAYER],
  charging: [CHARGING_LAYER],
};

function toParkingGeoJSON(facilities: ParkingFacility[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: facilities.map(facility => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [facility.longitude, facility.latitude] },
      properties: { id: facility.id, level: parkingLevel(facility) },
    })),
  };
}

function toWeathercamsGeoJSON(stations: WeathercamStation[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.map(station => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      properties: { id: station.id },
    })),
  };
}

function toChargingGeoJSON(stations: ChargingStation[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.map(station => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      properties: { id: station.id, level: chargingLevel(station) },
    })),
  };
}

function toStationsGeoJSON(stations: Station[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.map(station => {
      const [dir1, dir2] = directionalStatuses(station);
      const volume = stationVolume(station);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
        properties: {
          id: station.id,
          level1: dir1.level,
          level2: dir2.level,
          volume,
          bearing: station.bearing ?? 0,
        },
      };
    }),
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
  onSelectStation,
  onSelectFacility,
  onSelectCamera,
  onSelectCharger,
  visibility,
  theme,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const stationsById = useRef<globalThis.Map<number, Station>>(new globalThis.Map());
  const facilitiesById = useRef<globalThis.Map<number, ParkingFacility>>(new globalThis.Map());
  const camerasById = useRef<globalThis.Map<string, WeathercamStation>>(new globalThis.Map());
  const chargersById = useRef<globalThis.Map<string, ChargingStation>>(new globalThis.Map());
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const clickPopupRef = useRef<maplibregl.Popup | null>(null);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const geoErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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
  // custom source, layer and marker image, so the install has to run again once
  // the new style is ready â€” layer visibility survives via visibilityRef.
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

  const showGeoError = (message: string) => {
    setGeoError(message);
    if (geoErrorTimeoutRef.current) clearTimeout(geoErrorTimeoutRef.current);
    geoErrorTimeoutRef.current = setTimeout(() => setGeoError(null), 5000);
  };

  const locateUser = () => {
    const m = map.current;
    if (!m) return;
    if (!navigator.geolocation) {
      showGeoError('Geolocation is not supported by this browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLngLat(coords);
        } else {
          const el = document.createElement('div');
          el.className = 'user-location-dot';
          userLocationMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(m);
        }
        m.flyTo({ center: coords, zoom: 14, essential: true });
      },
      error => {
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

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLES[themeRef.current],
      center: [24.9384, 60.1699], // Helsinki center
      zoom: 6,
      pitch: 45,
    });
    map.current = m;

    hoverPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    clickPopupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: '280px' });

    const showPoiPopup = (
      lngLat: [number, number],
      title: string,
      description: string,
      speedLimit?: number,
      versionTime?: string
    ) => {
      const limitLine = speedLimit ? `<br/><span class="popup-desc">Work-zone speed limit: ${speedLimit} km/h</span>` : '';
      const updatedLine = versionTime
        ? `<br/><span class="popup-desc">Updated ${new Date(versionTime).toLocaleString('fi-FI')}</span>`
        : '';
      clickPopupRef.current
        ?.setLngLat(lngLat)
        .setHTML(
          `<strong>${title || 'Traffic message'}</strong>${description ? `<br/><span class="popup-desc">${description}</span>` : ''}${limitLine}${updatedLine}`
        )
        .addTo(m);
    };

    // Layers are re-added after every theme swap, but map event listeners
    // survive setStyle() â€” without this guard each swap would stack another
    // copy of every handler (double popups, double flyTo).
    const boundLayers = new Set<string>();
    const bindOnce = (layerId: string, bind: () => void) => {
      if (boundLayers.has(layerId)) return;
      boundLayers.add(layerId);
      bind();
    };

    const attachPoiInteractions = (layerId: string) => bindOnce(layerId, () => {
      m.on('mouseenter', layerId, () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', layerId, () => {
        m.getCanvas().style.cursor = '';
      });
      m.on('click', layerId, e => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature) return;
        const props = feature.properties as {
          title?: string;
          description?: string;
          speedLimit?: number;
          versionTime?: string;
        };
        const lngLat: [number, number] =
          feature.geometry.type === 'Point'
            ? (feature.geometry.coordinates as [number, number])
            : [e.lngLat.lng, e.lngLat.lat];
        showPoiPopup(lngLat, props.title ?? '', props.description ?? '', props.speedLimit, props.versionTime);
      });
    });

    const fetchPoiLayer = async (
      url: string,
      sourceId: string,
      lineColor: string,
      iconImage: string
    ) => {
      try {
        const res = await fetch(url);
        const geojson = await res.json();

        const source = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        // A theme switch may be mid-flight; the reinstall that follows it will
        // re-add this layer against the new style.
        if (!styleReadyRef.current) return;

        m.addSource(sourceId, { type: 'geojson', data: geojson });
        m.addLayer({
          id: `${sourceId}-line`,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': lineColor, 'line-width': 4, 'line-opacity': 0.85 },
        });
        m.addLayer({
          id: `${sourceId}-point`,
          type: 'symbol',
          source: sourceId,
          // Only draw the marker on point features; line features already show
          // as the colored line above (a circle/symbol layer would otherwise
          // repeat the icon at every vertex of a line).
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'icon-image': iconImage,
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        attachPoiInteractions(`${sourceId}-line`);
        attachPoiInteractions(`${sourceId}-point`);
        // sourceId is the LayerKey for the POI layers ('roadworks' / 'incidents').
        setLayersVisible(m, [`${sourceId}-line`, `${sourceId}-point`], visibilityRef.current[sourceId as LayerKey]);
      } catch (err) {
        console.error(`Failed to fetch ${sourceId}`, err);
      }
    };

    const directionHoverLine = (label: string, d: DirectionalStatus): string => {
      if (d.speed === null) return `${label}: no data`;
      const freeFlowText = d.freeFlow !== null ? ` (free-flow ${Math.round(d.freeFlow)} km/h)` : '';
      return `${label}: ${Math.round(d.speed)} km/h${freeFlowText}`;
    };

    const buildStationHoverHTML = (station: Station): string => {
      const [dir1, dir2] = directionalStatuses(station);
      return (
        `<strong>${station.name}</strong><br/>` +
        `${directionHoverLine('Direction 1', dir1)}<br/>` +
        `${directionHoverLine('Direction 2', dir2)}`
      );
    };

    const fetchStations = async () => {
      try {
        const res = await fetch('/api/tie/tms');
        const stations: Station[] = await res.json();

        stationsById.current = new globalThis.Map(stations.map(s => [s.id, s]));

        const stationsGeojson = toStationsGeoJSON(stations);
        const stationsSource = m.getSource(STATIONS_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (stationsSource) {
          stationsSource.setData(stationsGeojson);
          return;
        }

        if (!styleReadyRef.current) return;

        m.addSource(STATIONS_SOURCE, { type: 'geojson', data: stationsGeojson });
        m.addLayer({
          id: STATIONS_LAYER,
          type: 'symbol',
          source: STATIONS_SOURCE,
          layout: {
            // Split disc, left half = direction 1's level, right half =
            // direction 2's, one pre-rendered image per level combination
            // (see registerMarkerIcons/stationIconId).
            'icon-image': ['concat', 'station-', ['get', 'level1'], '-', ['get', 'level2'], '-icon'],
            'icon-size': [
              'interpolate', ['linear'], ['get', 'volume'],
              0, 0.5,
              100, 0.875,
              500, 1.5,
              1500, 2.25,
            ],
            // Rotated to the road's own bearing (map-aligned, so it turns
            // with the map, not the screen) so the split runs parallel to
            // the road, separating the two carriageways as they actually
            // sit rather than at an arbitrary angle.
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        setLayersVisible(m, LAYER_IDS.stations, visibilityRef.current.stations);

        bindOnce(STATIONS_LAYER, () => {
          m.on('mouseenter', STATIONS_LAYER, () => {
            m.getCanvas().style.cursor = 'pointer';
          });

          m.on('mouseleave', STATIONS_LAYER, () => {
            m.getCanvas().style.cursor = '';
            hoverPopupRef.current?.remove();
          });

          if (HOVER_CAPABLE) m.on('mousemove', STATIONS_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { id: number };
            const station = stationsById.current.get(props.id);
            if (!station) return;

            hoverPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(buildStationHoverHTML(station))
              .addTo(m);
          });

          m.on('click', STATIONS_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature) return;
            const props = feature.properties as { id: number };
            const station = stationsById.current.get(props.id);
            if (!station) return;

            onSelectStation(station);
            m.flyTo({
              center: [station.longitude, station.latitude],
              zoom: 12,
              essential: true,
            });
          });
        });
      } catch (err) {
        console.error('Failed to fetch TMS data', err);
      }
    };

    const fetchSpeedLimits = async () => {
      try {
        const res = await fetch('/api/tie/speedlimits');
        const signs: VariableSpeedSign[] = await res.json();

        const source = m.getSource(SPEEDLIMIT_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (!source && !styleReadyRef.current) return;

        // The sign images carry the displayed number baked in, so each distinct
        // limit needs its own image â€” registered lazily as values appear (a new
        // value can show up on any poll, and a style swap drops all images).
        for (const sign of new Set(signs.map(s => s.speedLimit))) {
          registerSpeedLimitIcon(m, sign);
        }

        const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: 'FeatureCollection',
          features: signs.map(sign => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [sign.longitude, sign.latitude] },
            properties: { id: sign.id, speedLimit: sign.speedLimit, effectDate: sign.effectDate ?? '' },
          })),
        };

        if (source) {
          source.setData(geojson);
          return;
        }

        m.addSource(SPEEDLIMIT_SOURCE, { type: 'geojson', data: geojson });
        m.addLayer({
          id: SPEEDLIMIT_LAYER,
          type: 'symbol',
          source: SPEEDLIMIT_SOURCE,
          layout: {
            'icon-image': ['concat', 'speedlimit-', ['to-string', ['get', 'speedLimit']], '-icon'],
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        setLayersVisible(m, LAYER_IDS.speedlimits, visibilityRef.current.speedlimits);

        bindOnce(SPEEDLIMIT_LAYER, () => {
          m.on('mouseenter', SPEEDLIMIT_LAYER, () => {
            m.getCanvas().style.cursor = 'pointer';
          });

          m.on('mouseleave', SPEEDLIMIT_LAYER, () => {
            m.getCanvas().style.cursor = '';
            hoverPopupRef.current?.remove();
          });

          if (HOVER_CAPABLE) m.on('mousemove', SPEEDLIMIT_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { speedLimit: number; effectDate?: string };

            hoverPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(speedSignPopupHTML(props))
              .addTo(m);
          });

          // Touch screens get no hover, so a tap opens the same details in the
          // closeable click popup instead.
          m.on('click', SPEEDLIMIT_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { speedLimit: number; effectDate?: string };

            clickPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(speedSignPopupHTML(props))
              .addTo(m);
          });
        });
      } catch (err) {
        console.error('Failed to fetch variable speed limits', err);
      }
    };

    const fetchParking = async () => {
      try {
        const res = await fetch('/api/tie/parking');
        const allFacilities: ParkingFacility[] = await res.json();
        // Facilities with no live utilization row yet carry no useful info â€” hide them.
        const facilities = allFacilities.filter(f => f.spacesAvailable != null);

        facilitiesById.current = new globalThis.Map(facilities.map(f => [f.id, f]));

        const geojson = toParkingGeoJSON(facilities);
        const source = m.getSource(PARKING_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        if (!styleReadyRef.current) return;

        m.addSource(PARKING_SOURCE, { type: 'geojson', data: geojson });
        m.addLayer({
          id: PARKING_LAYER,
          type: 'symbol',
          source: PARKING_SOURCE,
          layout: {
            'icon-image': [
              'match', ['get', 'level'],
              'plenty', MARKER_ICONS.parking.plenty,
              'limited', MARKER_ICONS.parking.limited,
              'full', MARKER_ICONS.parking.full,
              MARKER_ICONS.parking.unknown,
            ],
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        setLayersVisible(m, LAYER_IDS.parking, visibilityRef.current.parking);

        bindOnce(PARKING_LAYER, () => {
          m.on('mouseenter', PARKING_LAYER, () => {
            m.getCanvas().style.cursor = 'pointer';
          });

          m.on('mouseleave', PARKING_LAYER, () => {
            m.getCanvas().style.cursor = '';
            hoverPopupRef.current?.remove();
          });

          if (HOVER_CAPABLE) m.on('mousemove', PARKING_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { id: number };
            const facility = facilitiesById.current.get(props.id);
            if (!facility) return;
            const spacesText =
              facility.spacesAvailable != null ? `${facility.spacesAvailable} / ${facility.capacity} free` : 'no data';

            hoverPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(`<strong>${facility.name}</strong><br/>${spacesText}`)
              .addTo(m);
          });

          m.on('click', PARKING_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature) return;
            const props = feature.properties as { id: number };
            const facility = facilitiesById.current.get(props.id);
            if (!facility) return;

            onSelectFacility(facility);
            m.flyTo({
              center: [facility.longitude, facility.latitude],
              zoom: 14,
              essential: true,
            });
          });
        });
      } catch (err) {
        console.error('Failed to fetch parking data', err);
      }
    };

    const fetchWeathercams = async () => {
      try {
        const res = await fetch('/api/tie/weathercams');
        const stations: WeathercamStation[] = await res.json();

        camerasById.current = new globalThis.Map(stations.map(s => [s.id, s]));

        const geojson = toWeathercamsGeoJSON(stations);
        const source = m.getSource(WEATHERCAM_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        if (!styleReadyRef.current) return;

        m.addSource(WEATHERCAM_SOURCE, { type: 'geojson', data: geojson });
        m.addLayer({
          id: WEATHERCAM_LAYER,
          type: 'symbol',
          source: WEATHERCAM_SOURCE,
          layout: {
            'icon-image': MARKER_ICONS.weathercam,
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        setLayersVisible(m, LAYER_IDS.weathercams, visibilityRef.current.weathercams);

        bindOnce(WEATHERCAM_LAYER, () => {
          m.on('mouseenter', WEATHERCAM_LAYER, () => {
            m.getCanvas().style.cursor = 'pointer';
          });

          m.on('mouseleave', WEATHERCAM_LAYER, () => {
            m.getCanvas().style.cursor = '';
            hoverPopupRef.current?.remove();
          });

          if (HOVER_CAPABLE) m.on('mousemove', WEATHERCAM_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { id: string };
            const camera = camerasById.current.get(props.id);
            if (!camera) return;

            hoverPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(`<strong>${camera.name}</strong><br/>${camera.presets.length} camera view(s)`)
              .addTo(m);
          });

          m.on('click', WEATHERCAM_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature) return;
            const props = feature.properties as { id: string };
            const camera = camerasById.current.get(props.id);
            if (!camera) return;

            onSelectCamera(camera);
            m.flyTo({
              center: [camera.longitude, camera.latitude],
              zoom: 14,
              essential: true,
            });
          });
        });
      } catch (err) {
        console.error('Failed to fetch weathercam data', err);
      }
    };

    const fetchCharging = async () => {
      try {
        const res = await fetch('/api/tie/charging');
        const stations: ChargingStation[] = await res.json();

        chargersById.current = new globalThis.Map(stations.map(s => [s.id, s]));

        const geojson = toChargingGeoJSON(stations);
        const source = m.getSource(CHARGING_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }

        if (!styleReadyRef.current) return;

        m.addSource(CHARGING_SOURCE, { type: 'geojson', data: geojson });
        m.addLayer({
          id: CHARGING_LAYER,
          type: 'symbol',
          source: CHARGING_SOURCE,
          layout: {
            'icon-image': [
              'match', ['get', 'level'],
              'available', MARKER_ICONS.charging.available,
              'limited', MARKER_ICONS.charging.limited,
              'full', MARKER_ICONS.charging.full,
              MARKER_ICONS.charging.unknown,
            ],
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        setLayersVisible(m, LAYER_IDS.charging, visibilityRef.current.charging);

        bindOnce(CHARGING_LAYER, () => {
          m.on('mouseenter', CHARGING_LAYER, () => {
            m.getCanvas().style.cursor = 'pointer';
          });

          m.on('mouseleave', CHARGING_LAYER, () => {
            m.getCanvas().style.cursor = '';
            hoverPopupRef.current?.remove();
          });

          if (HOVER_CAPABLE) m.on('mousemove', CHARGING_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature || feature.geometry.type !== 'Point') return;
            const props = feature.properties as { id: string };
            const charger = chargersById.current.get(props.id);
            if (!charger) return;

            hoverPopupRef.current
              ?.setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(`<strong>${charger.name}</strong><br/>${availabilityText(charger)}`)
              .addTo(m);
          });

          m.on('click', CHARGING_LAYER, e => {
            const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!feature) return;
            const props = feature.properties as { id: string };
            const charger = chargersById.current.get(props.id);
            if (!charger) return;

            onSelectCharger(charger);
            m.flyTo({
              center: [charger.longitude, charger.latitude],
              zoom: 14,
              essential: true,
            });
          });
        });
      } catch (err) {
        console.error('Failed to fetch charging data', err);
      }
    };

    const intervalIds: ReturnType<typeof setInterval>[] = [];

    const fetchRoadworks = () =>
      fetchPoiLayer('/api/tie/roadworks', ROADWORKS_SOURCE, poiColors(themeRef.current).roadworks, MARKER_ICONS.roadworks);
    const fetchIncidents = () =>
      fetchPoiLayer('/api/tie/incidents', INCIDENTS_SOURCE, poiColors(themeRef.current).incidents, MARKER_ICONS.incidents);

    // Everything a style owns: marker images plus every source and layer. Runs
    // on first load and again after each theme swap, since setStyle() drops the
    // lot. The fetch helpers re-add whatever is missing and only setData when
    // it survived, so this is safe to call repeatedly.
    const installLayers = () => {
      registerMarkerIcons(m, themeRef.current);

      // Sequenced so the stations/road layers are always added (and thus
      // stacked below) before the POI layers, regardless of fetch timing.
      fetchStations().then(() => {
        fetchRoadworks();
        fetchIncidents();
        fetchSpeedLimits();
        fetchParking();
        fetchWeathercams();
        fetchCharging();
      });
    };
    installLayersRef.current = installLayers;

    m.on('load', () => {
      styleReadyRef.current = true;
      installLayers();

      // Registered once â€” a theme swap reinstalls layers, not timers.
      intervalIds.push(setInterval(fetchStations, 60000));
      intervalIds.push(setInterval(fetchRoadworks, 120000));
      intervalIds.push(setInterval(fetchIncidents, 120000));
      // Variable limits change with conditions; the backend refreshes every
      // minute, so match that.
      intervalIds.push(setInterval(fetchSpeedLimits, 60000));
      intervalIds.push(setInterval(fetchParking, 60000));
      // Weathercam stations/presets rarely change, so poll infrequently â€” the
      // camera images themselves are fetched fresh directly from
      // weathercam.digitraffic.fi by <img> tags, not through this list.
      intervalIds.push(setInterval(fetchWeathercams, 300000));
      // Charging locations change rarely; live availability updates on the
      // backend's 5-min poll, so refreshing here every 5 min is plenty.
      intervalIds.push(setInterval(fetchCharging, 300000));
    });

    return () => {
      intervalIds.forEach(clearInterval);
      installLayersRef.current = null;
      if (geoErrorTimeoutRef.current) clearTimeout(geoErrorTimeoutRef.current);
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      m.remove();
      map.current = null;
    };
  }, []);

  return (
    <>
      <div ref={mapContainer} className="map-container" />
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

export default Map;
