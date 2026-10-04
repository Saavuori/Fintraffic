// Shared layer identity used by the map, its toggle buttons, and the legend so
// all three stay in sync from a single source. The concrete MapLibre layer ids
// per key stay in Map.tsx since only the map needs them.

export type LayerKey = 'airline' | 'general' | 'rotorcraft' | 'military' | 'airports' | 'labels';

export const LAYER_ORDER: LayerKey[] = [
  'airline',
  'general',
  'rotorcraft',
  'military',
  'airports',
  'labels',
];

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  airline: true,
  general: true,
  rotorcraft: true,
  military: true,
  airports: true,
  labels: true,
};
