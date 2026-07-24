// Shared layer identity used by the map, its toggle checkboxes, and the legend
// so all three stay in sync from a single source. The concrete MapLibre layer
// ids per key stay in Map.tsx since only the map needs them.

export type LayerKey = 'longDistance' | 'commuter' | 'cargo' | 'other' | 'stations' | 'tracks';

// Display order for both the layer-toggle panel and the legend.
export const LAYER_ORDER: LayerKey[] = [
  'longDistance',
  'commuter',
  'cargo',
  'other',
  'stations',
  'tracks',
];

export const LAYER_LABELS: Record<LayerKey, string> = {
  longDistance: 'Long-distance trains',
  commuter: 'Commuter trains',
  cargo: 'Cargo trains',
  other: 'Other trains',
  stations: 'Stations',
  tracks: 'Railway tracks',
};

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  longDistance: true,
  commuter: true,
  cargo: true,
  other: true,
  stations: true,
  tracks: true,
};
