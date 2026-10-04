import type { Theme } from './theme';

// Types mirror backend/internal/ilma/models.go — change one, change both.

export type AircraftGroup = 'airline' | 'general' | 'rotorcraft' | 'military';

export interface Aircraft {
  hex: string;
  callsign: string;
  registration?: string;
  typeCode?: string;
  typeName?: string;
  airline?: string;
  category?: string;
  group: AircraftGroup;
  latitude: number;
  longitude: number;
  /** Barometric altitude in feet; absent on the ground or when unknown. */
  altitudeFt?: number;
  onGround: boolean;
  groundSpeedKt?: number;
  /** Degrees true, over ground. */
  track?: number;
  verticalRateFpm?: number;
  squawk?: string;
  /** Transponder emergency state ("general", "lifeguard", "nordo", "unlawful", …). */
  emergency?: string;
  source: 'adsb' | 'mlat' | 'tisb' | 'other';
  /** When the position was fixed, unix ms (server clock). */
  timestamp: number;
}

export interface Snapshot {
  /** Server clock at serve time, unix ms. */
  time: number;
  aircraft: Aircraft[];
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  altitudeFt?: number;
  timestamp: number;
}

export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationFt: number;
  scheduled: boolean;
}

export const GROUP_ORDER: AircraftGroup[] = ['airline', 'general', 'rotorcraft', 'military'];

export const GROUP_LABELS: Record<AircraftGroup, string> = {
  airline: 'Airline flights',
  general: 'General aviation',
  rotorcraft: 'Helicopters',
  military: 'Military & state',
};

// Four hues far apart on the wheel, none of them the orange chrome accent, so
// a silhouette's colour says what it is even at country-wide zoom. Both blocks
// must stay in sync with the swatches the FilterPanel renders.
const GROUP_COLORS_DARK: Record<AircraftGroup, string> = {
  airline: '#facc15',
  general: '#38bdf8',
  rotorcraft: '#f472b6',
  military: '#a3e635',
};

const GROUP_COLORS_LIGHT: Record<AircraftGroup, string> = {
  airline: '#a16207',
  general: '#0369a1',
  rotorcraft: '#be185d',
  military: '#4d7c0f',
};

export function groupColors(theme: Theme): Record<AircraftGroup, string> {
  return theme === 'light' ? GROUP_COLORS_LIGHT : GROUP_COLORS_DARK;
}

/** Airport marker colour, shared by the map layer and the search accent. */
export const AIRPORT_COLORS: Record<Theme, string> = {
  dark: '#cbd5e1',
  light: '#334155',
};

/** Ring drawn around an aircraft squawking an emergency. */
export const EMERGENCY_COLOR = '#ef4444';

/**
 * The trail's altitude ramp, in feet: warm near the ground, cooling as the
 * aircraft climbs — the convention flight trackers share, so a trail reads as a
 * climb-out or an approach without a legend.
 */
export const ALTITUDE_STOPS: Array<[number, string]> = [
  [0, '#f97316'],
  [2000, '#facc15'],
  [10000, '#4ade80'],
  [20000, '#22d3ee'],
  [30000, '#818cf8'],
  [40000, '#e879f9'],
];

const FT_TO_M = 0.3048;
const KT_TO_KMH = 1.852;

/** What a person calls this aircraft: its flight, else its tail, else its address. */
export function aircraftTitle(a: Pick<Aircraft, 'callsign' | 'registration' | 'hex'>): string {
  return a.callsign || a.registration || a.hex.toUpperCase();
}

/** Thousands with a thin space, the Finnish way: 39 000. */
function groupThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function altitudeText(a: Pick<Aircraft, 'altitudeFt' | 'onGround'>): string {
  if (a.onGround) return 'On ground';
  if (a.altitudeFt == null) return '—';
  return `${groupThousands(a.altitudeFt)} ft`;
}

export function altitudeMetres(a: Pick<Aircraft, 'altitudeFt' | 'onGround'>): string {
  if (a.onGround || a.altitudeFt == null) return '';
  return `${groupThousands(a.altitudeFt * FT_TO_M)} m`;
}

export function speedText(a: Pick<Aircraft, 'groundSpeedKt'>): string {
  if (a.groundSpeedKt == null) return '—';
  return `${Math.round(a.groundSpeedKt)} kt`;
}

export function speedKmh(a: Pick<Aircraft, 'groundSpeedKt'>): string {
  if (a.groundSpeedKt == null) return '';
  return `${Math.round(a.groundSpeedKt * KT_TO_KMH)} km/h`;
}

export type VerticalTrend = 'climb' | 'descend' | 'level';

/** ±300 ft/min is the noise floor of a level cruise in turbulence. */
export function verticalTrend(rateFpm: number | undefined): VerticalTrend {
  if (rateFpm == null || Math.abs(rateFpm) < 300) return 'level';
  return rateFpm > 0 ? 'climb' : 'descend';
}

export function verticalText(rateFpm: number | undefined): string {
  if (rateFpm == null) return '—';
  const trend = verticalTrend(rateFpm);
  if (trend === 'level') return 'Level';
  return `${trend === 'climb' ? '↑' : '↓'} ${groupThousands(Math.abs(rateFpm))} ft/min`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function trackText(track: number | undefined): string {
  if (track == null) return '—';
  const deg = ((Math.round(track) % 360) + 360) % 360;
  return `${deg}° ${COMPASS[Math.round(deg / 45) % 8]}`;
}

export const EMERGENCY_LABELS: Record<string, string> = {
  general: 'Emergency',
  lifeguard: 'Medical emergency',
  minfuel: 'Minimum fuel',
  nordo: 'Radio failure',
  unlawful: 'Unlawful interference',
  downed: 'Aircraft down',
};

export const SOURCE_LABELS: Record<Aircraft['source'], string> = {
  adsb: 'ADS-B',
  mlat: 'MLAT (multilateration)',
  tisb: 'TIS-B',
  other: 'Other',
};

const EARTH_RADIUS_M = 6371000;
const KT_TO_MS = 0.514444;
const DEG = Math.PI / 180;

/**
 * Where an aircraft is `dtSeconds` after its fix, flying straight on at its
 * ground speed and track. Equirectangular — plenty accurate for the couple of
 * kilometres a jet covers between polls.
 */
export function advance(
  lat: number,
  lng: number,
  speedKt: number,
  trackDeg: number,
  dtSeconds: number
): { lat: number; lng: number } {
  const dist = speedKt * KT_TO_MS * dtSeconds;
  const bearing = trackDeg * DEG;
  const dLat = (dist * Math.cos(bearing)) / EARTH_RADIUS_M / DEG;
  const dLng = (dist * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(lat * DEG)) / DEG;
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Equirectangular distance in km — accurate at the tens of km we rank on. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const meanLat = ((a.lat + b.lat) / 2) * DEG;
  const dx = (a.lng - b.lng) * Math.cos(meanLat);
  const dy = a.lat - b.lat;
  return (Math.sqrt(dx * dx + dy * dy) * DEG * EARTH_RADIUS_M) / 1000;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** How far out, and how low, counts as "at the airport" — the final approach and the climb-out. */
const AIRPORT_RADIUS_KM = 25;
const AIRPORT_CEILING_FT = 6000;

/**
 * Aircraft on the ground at, or low over, an airport: arrivals on final,
 * departures climbing out, anything taxiing. Nearest first.
 */
export function aircraftAround(
  airport: Pick<Airport, 'latitude' | 'longitude' | 'elevationFt'>,
  aircraft: Aircraft[]
): Array<{ aircraft: Aircraft; km: number }> {
  const centre = { lat: airport.latitude, lng: airport.longitude };
  return aircraft
    .filter(a => a.onGround || (a.altitudeFt != null && a.altitudeFt - airport.elevationFt < AIRPORT_CEILING_FT))
    .map(a => ({ aircraft: a, km: distanceKm(centre, { lat: a.latitude, lng: a.longitude }) }))
    .filter(x => x.km <= AIRPORT_RADIUS_KM)
    .sort((x, y) => x.km - y.km);
}

/** Below this the altimeter is set to local pressure and heights are feet, not flight levels. */
const TRANSITION_ALTITUDE_FT = 5000;

/**
 * The compact altitude a map label carries: a flight level above Finland's
 * transition altitude ("FL390"), plain feet below it ("2500 ft"), "GND" on the
 * ground — the same terms a controller would use.
 */
export function altitudeShort(a: Pick<Aircraft, 'altitudeFt' | 'onGround'>): string {
  if (a.onGround) return 'GND';
  if (a.altitudeFt == null) return '';
  if (a.altitudeFt >= TRANSITION_ALTITUDE_FT) {
    return `FL${String(Math.round(a.altitudeFt / 100)).padStart(3, '0')}`;
  }
  return `${Math.max(0, Math.round(a.altitudeFt / 100) * 100)} ft`;
}
