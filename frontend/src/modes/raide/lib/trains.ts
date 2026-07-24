import type { Theme } from './theme';

// Types mirror backend/internal/models — change one, change both.

export interface NextStop {
  code: string;
  name: string;
  scheduledTime: string;
  estimateTime?: string;
  track?: string;
}

export interface Train {
  trainNumber: number;
  departureDate: string;
  trainType: string;
  category: string;
  commuterLine: string;
  operator: string;
  cancelled: boolean;
  latitude: number;
  longitude: number;
  speed: number;
  timestamp: string;
  delayMin: number;
  hasDelay: boolean;
  origin: string;
  dest: string;
  departTime: string;
  arriveTime: string;
  nextStop?: NextStop;
  stops?: NextStop[];
}

export interface StationMeta {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  passenger: boolean;
  major: boolean;
}

export interface BoardRow {
  trainNumber: number;
  trainType: string;
  category: string;
  commuterLine: string;
  terminus: string;
  scheduledTime: string;
  liveTime?: string;
  delayMin: number;
  track?: string;
  cancelled: boolean;
}

export interface Board {
  station: string;
  departures: BoardRow[];
  arrivals: BoardRow[];
}

/** Map/legend/toggle grouping of Digitraffic's six train categories. */
export type TrainGroup = 'longDistance' | 'commuter' | 'cargo' | 'other';

export function trainGroup(category: string): TrainGroup {
  switch (category) {
    case 'Long-distance':
      return 'longDistance';
    case 'Commuter':
      return 'commuter';
    case 'Cargo':
      return 'cargo';
    default:
      // Locomotive, Shunting, On-track machines, Unknown
      return 'other';
  }
}

// Marker colors lean on Finnish rail liveries: VR long-distance green, purple
// Sm5 commuter units, freight amber. Both blocks must stay in sync with the
// category swatches the FilterPanel renders.
const GROUP_COLORS_DARK: Record<TrainGroup, string> = {
  longDistance: '#2ecc71',
  commuter: '#b48bf2',
  cargo: '#f39c12',
  other: '#8f9aa6',
};

const GROUP_COLORS_LIGHT: Record<TrainGroup, string> = {
  longDistance: '#0e8a48',
  commuter: '#7c50c8',
  cargo: '#c87f0a',
  other: '#67737f',
};

export function groupColors(theme: Theme): Record<TrainGroup, string> {
  return theme === 'light' ? GROUP_COLORS_LIGHT : GROUP_COLORS_DARK;
}

/** Station marker color, shared by the map layer and the legend swatch. */
export const STATION_COLORS: Record<Theme, string> = {
  dark: '#5ab6e8',
  light: '#0369a1',
};

/**
 * Short display label: commuter trains go by their line letter ("I", "P"),
 * everything else by type + number ("IC 7", "T 5504").
 */
export function trainLabel(train: Pick<Train, 'trainType' | 'trainNumber' | 'commuterLine'>): string {
  if (train.commuterLine) return train.commuterLine;
  return `${train.trainType} ${train.trainNumber}`;
}

/** Longer name for panels: "IC 7" / "Commuter I 8342". */
export function trainTitle(train: Train): string {
  if (train.commuterLine) return `${train.commuterLine} (${train.trainType} ${train.trainNumber})`;
  return `${train.trainType} ${train.trainNumber}`;
}

export function delayText(delayMin: number, hasDelay: boolean): string {
  if (!hasDelay) return 'not started';
  if (delayMin > 0) return `+${delayMin} min`;
  if (delayMin < 0) return `${delayMin} min`;
  return 'on time';
}

/** CSS class bucket for a delay value, used by the panel and boards. */
export function delayClass(delayMin: number): string {
  if (delayMin >= 10) return 'delay-bad';
  if (delayMin >= 3) return 'delay-warn';
  return 'delay-ok';
}

/**
 * Map-marker delay bucket: 'none' for a train that hasn't started yet (no
 * delay to show), otherwise the same thresholds as delayClass. The map only
 * draws a ring for 'warn'/'bad' — an on-time train doesn't need a badge.
 */
export type DelaySeverity = 'none' | 'ok' | 'warn' | 'bad';

export function delaySeverity(delayMin: number, hasDelay: boolean): DelaySeverity {
  if (!hasDelay) return 'none';
  if (delayMin >= 10) return 'bad';
  if (delayMin >= 3) return 'warn';
  return 'ok';
}

/** Ring color for a delayed train marker, shared by the map layer and the legend. */
export const DELAY_RING_COLORS: Record<'warn' | 'bad', string> = {
  warn: '#f2c94c',
  bad: '#e63946',
};

export function formatTime(iso: string): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

export const CATEGORY_LABELS: Record<TrainGroup, string> = {
  longDistance: 'Long-distance',
  commuter: 'Commuter',
  cargo: 'Cargo',
  other: 'Other (locos, work)',
};
