import type { Theme } from './theme';
import { humanizeEnum } from './parking';

// Road maintenance tracking (Digitraffic /api/maintenance): where snowploughs,
// gritters, graders and other maintenance vehicles are now, and the roads they
// have covered in the last hour. Digitraffic publishes no stable vehicle id, so
// vehicles are shown in popups rather than as selections.

export interface MaintenanceVehicle {
  id: number;
  longitude: number;
  latitude: number;
  /** When the vehicle reported this point. */
  time: string;
  /** Digitraffic task ids, e.g. PLOUGHING_AND_SLUSH_REMOVAL. */
  tasks: string[];
  /** Heading in degrees, when reported. */
  direction?: number;
  domain?: string;
  source?: string;
}

export interface MaintenanceRouteProps {
  tasks: string[];
  endTime: string;
}

export interface MaintenanceSnapshot {
  vehicles: MaintenanceVehicle[];
  routes: GeoJSON.FeatureCollection<GeoJSON.LineString, MaintenanceRouteProps>;
}

export type MaintenanceCategory = 'plough' | 'grit' | 'other';
export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = ['plough', 'grit', 'other'];

// Snow removal proper. SNOW_PLOUGHING_STICKS_AND_SNOW_FENCES is the autumn job
// of putting up plough markers, not ploughing, so it is deliberately not here.
const PLOUGH_TASKS = new Set([
  'PLOUGHING_AND_SLUSH_REMOVAL',
  'PLOUGHING_OF_SLUSH_DITCH',
  'LOWERING_OF_SNOWBANKS',
  'TRANSFER_OF_SNOW',
  'REMOVAL_OF_BULGE_ICE',
]);

// Anti-skid treatment.
const GRIT_TASKS = new Set(['SALTING', 'LINE_SANDING', 'SPOT_SANDING']);

/** Ploughing wins over gritting: ploughs often salt as they go. */
export function maintenanceCategory(tasks: string[]): MaintenanceCategory {
  if (tasks.some(t => PLOUGH_TASKS.has(t))) return 'plough';
  if (tasks.some(t => GRIT_TASKS.has(t))) return 'grit';
  return 'other';
}

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  plough: 'Snow ploughing',
  grit: 'Salting / sanding',
  other: 'Other maintenance',
};

const MAINTENANCE_COLORS: Record<MaintenanceCategory, string> = {
  plough: '#4f8ff7',
  grit: '#e8a33d',
  other: '#9aa5b1',
};

const MAINTENANCE_COLORS_LIGHT: Record<MaintenanceCategory, string> = {
  plough: '#1f5fd1',
  grit: '#b46d0c',
  other: '#5b6b7a',
};

export function maintenanceColors(theme: Theme): Record<MaintenanceCategory, string> {
  return theme === 'light' ? MAINTENANCE_COLORS_LIGHT : MAINTENANCE_COLORS;
}

// The few task ids that don't humanize cleanly.
const TASK_LABELS: Record<string, string> = {
  GARBAGE_OLLECTION: 'Garbage collection',
  ENSURING_TRAFFIC_IN_RASPUTITSA: 'Ensuring traffic at a frost-heave site',
  LEVELLING_OF_ROAD_SHOULDERS_UNDER_RAILING: 'Levelling of road shoulders under the railing',
};

export function taskLabel(task: string): string {
  return TASK_LABELS[task] ?? humanizeEnum(task);
}

export function minutesAgo(time: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(time).getTime()) / 60000));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

export function maintenancePopupHTML(vehicle: MaintenanceVehicle, now: number): string {
  const category = MAINTENANCE_CATEGORY_LABELS[maintenanceCategory(vehicle.tasks)];
  const tasks = vehicle.tasks.length ? vehicle.tasks.map(taskLabel).join(', ') : 'No task reported';
  const age = minutesAgo(vehicle.time, now);
  const ageText = age < 1 ? 'just now' : `${age} min ago`;
  const source = vehicle.source ? ` · ${escapeHtml(vehicle.source)}` : '';
  return (
    `<strong>${category}</strong><br/>` +
    `<span class="popup-desc">${escapeHtml(tasks)}</span><br/>` +
    `<span class="popup-desc">Reported ${ageText}${source}</span>`
  );
}
