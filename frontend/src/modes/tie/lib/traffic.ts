import type { Theme } from './theme';

export interface SensorValue {
  id: number;
  value: number;
  shortName: string;
  sensorValueDescriptionFI?: string;
  unit?: string;
}

export interface Station {
  id: number;
  name: string;
  longitude: number;
  latitude: number;
  data: SensorValue[];
  // Road bearing in degrees and seasonal free-flow ("speed limit baseline")
  // speed per direction, from the station's sensor-constants (see backend).
  bearing?: number | null;
  freeFlow1?: number | null;
  freeFlow2?: number | null;
}

// Digitraffic reuses shortNames (e.g. "km/h1") across many sensor variants
// (5min/60min, fixed/rolling window), so sensors must be matched by their
// stable numeric id, not shortName. These are the rolling 5-minute average
// speed and vehicle count sensors, per direction (see /api/tms/v1/sensors).
const SPEED_SENSOR_ID_DIR1 = 5122; // KESKINOPEUS_5MIN_LIUKUVA_SUUNTA1
const SPEED_SENSOR_ID_DIR2 = 5125; // KESKINOPEUS_5MIN_LIUKUVA_SUUNTA2
const VOLUME_SENSOR_IDS = [5116, 5119]; // OHITUKSET_5MIN_LIUKUVA_SUUNTA1/2

export type CongestionLevel = 'free' | 'moderate' | 'heavy' | 'unknown';
export const CONGESTION_LEVELS: CongestionLevel[] = ['free', 'moderate', 'heavy', 'unknown'];

export function sensorValue(data: SensorValue[], id: number): number | null {
  const s = data.find(d => d.id === id);
  return s ? s.value : null;
}

function congestionLevel(relativeSpeed: number | null, absoluteSpeed: number | null): CongestionLevel {
  if (relativeSpeed !== null) {
    return relativeSpeed >= 0.85 ? 'free' : relativeSpeed >= 0.6 ? 'moderate' : 'heavy';
  }
  if (absoluteSpeed === null) return 'unknown';
  // Fallback for the few stations with no free-flow baseline: absolute speed bands.
  return absoluteSpeed >= 80 ? 'free' : absoluteSpeed >= 50 ? 'moderate' : 'heavy';
}

export interface DirectionalStatus {
  speed: number | null;
  freeFlow: number | null;
  relativeSpeed: number | null;
  level: CongestionLevel;
}

function directionStatus(speed: number | null, freeFlow: number | null | undefined): DirectionalStatus {
  if (speed === null) return { speed: null, freeFlow: freeFlow ?? null, relativeSpeed: null, level: 'unknown' };
  const relativeSpeed = freeFlow ? speed / freeFlow : null;
  return { speed, freeFlow: freeFlow ?? null, relativeSpeed, level: congestionLevel(relativeSpeed, speed) };
}

// Each direction's own speed/level, independent of the other — so the map
// can show a road that's fine one way and congested the other instead of
// collapsing both into a single worst-case reading.
export function directionalStatuses(station: Station): [DirectionalStatus, DirectionalStatus] {
  const speed1 = sensorValue(station.data, SPEED_SENSOR_ID_DIR1);
  const speed2 = sensorValue(station.data, SPEED_SENSOR_ID_DIR2);
  return [
    directionStatus(speed1 !== null && speed1 >= 0 ? speed1 : null, station.freeFlow1),
    directionStatus(speed2 !== null && speed2 >= 0 ? speed2 : null, station.freeFlow2),
  ];
}

// Total vehicle count across both directions' 5-minute rolling volume sensors.
export function stationVolume(station: Station): number {
  return VOLUME_SENSOR_IDS
    .map(id => sensorValue(station.data, id))
    .filter((v): v is number => v !== null && v >= 0)
    .reduce((sum, v) => sum + v, 0);
}

export const CONGESTION_COLORS: Record<CongestionLevel, string> = {
  free: '#2ecc71',
  moderate: '#f1c40f',
  heavy: '#e74c3c',
  unknown: '#7f8c8d',
};

// Only the colors that wash out on the light basemap are overridden — mid
// yellow and mid grey are near-invisible on near-white. Everything the map
// paints and the legend labels goes through congestionColors() so the two can
// never drift apart.
const CONGESTION_COLORS_LIGHT: Record<CongestionLevel, string> = {
  ...CONGESTION_COLORS,
  moderate: '#b7860b',
  unknown: '#5b6b7a',
};

export function congestionColors(theme: Theme): Record<CongestionLevel, string> {
  return theme === 'light' ? CONGESTION_COLORS_LIGHT : CONGESTION_COLORS;
}

