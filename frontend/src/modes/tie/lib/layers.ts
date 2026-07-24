import type { Theme } from './theme';

// Shared layer identity used by the map, its toggle checkboxes, and the legend
// so all three stay in sync from a single source. LAYER_IDS (the concrete
// MapLibre layer ids per key) stays in Map.tsx since only the map needs it.

export type LayerKey = 'stations' | 'roadworks' | 'incidents' | 'speedlimits' | 'parking' | 'weathercams' | 'charging';

// Display order for both the layer-toggle panel and the legend.
export const LAYER_ORDER: LayerKey[] = [
  'stations',
  'roadworks',
  'incidents',
  'speedlimits',
  'parking',
  'weathercams',
  'charging',
];

export const LAYER_LABELS: Record<LayerKey, string> = {
  stations: 'Stations',
  roadworks: 'Road works',
  incidents: 'Incidents',
  speedlimits: 'Variable speed limits',
  parking: 'Parking',
  weathercams: 'Weather cameras',
  charging: 'EV charging',
};

// Road works / incidents have no per-feature levels, so their single color
// lives here next to the other shared layer meta rather than being repeated in
// the map paint, the legend swatch and the marker icon.
const POI_COLORS = {
  roadworks: '#f39c12',
  incidents: '#9b59b6',
} as const;

const POI_COLORS_LIGHT = {
  roadworks: '#c87f0a',
  incidents: '#7d4a9c',
} as const;

export function poiColors(theme: Theme): Record<'roadworks' | 'incidents', string> {
  return theme === 'light' ? POI_COLORS_LIGHT : POI_COLORS;
}

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  stations: true,
  roadworks: true,
  incidents: true,
  speedlimits: true,
  parking: true,
  weathercams: true,
  charging: true,
};
