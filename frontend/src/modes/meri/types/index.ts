export interface Vessel {
  mmsi: number;
  lat: number;
  lng: number;
  sog: number; // knots
  cog: number; // degrees
  hdg?: number; // true heading; absent when AIS reports "unavailable"
  navStat: number;
  rot?: number;
  ts: number; // epoch seconds of the position fix
  name?: string;
  callSign?: string;
  dest?: string;
  shipType?: number;
  imo?: number;
  draught?: number; // meters
  eta?: string; // "MM-DD HH:MM" UTC
}

export interface StreamMessage {
  type: 'snapshot' | 'delta';
  timestamp: string;
  vessels: Record<string, Vessel>;
  removed?: string[];
  count: number;
}

export interface Port {
  locode: string;
  name: string;
  lat: number;
  lng: number;
}

// Recorded vessel track history. Each point is [lng, lat, ts, cog, sog] —
// lng-first so the leading pair drops straight into a GeoJSON LineString, with
// course/speed trailing so the same points can be replayed as movement. Same
// layout as ReplayPoint, deliberately: one interpolator serves both.
export type TrailPoint = [number, number, number, number, number];

export interface VesselTrailResponse {
  mmsi: number;
  points: TrailPoint[];
}

// One recorded fix in a fleet replay: [lng, lat, ts, cog, sog]. cog (course
// over ground, degrees) drives the marker heading during playback; sog (knots)
// feeds the detail panel while a vessel is selected during replay.
export type ReplayPoint = TrailPoint;

export interface FleetReplayResponse {
  from: number; // window start, epoch seconds
  to: number; // window end, epoch seconds
  truncated: boolean; // true when the window held more points than the server cap
  vessels: Record<string, ReplayPoint[]>; // keyed by MMSI, each track ascending by time
}

export interface PortCall {
  portCallId: number;
  portCallTimestamp: string;
  vesselName: string;
  mmsi?: number;
  imo?: number;
  prevPort?: string;
  nextPort?: string;
  imoInformation?: unknown[];
  portAreaDetails?: PortAreaDetail[];
}

export interface PortAreaDetail {
  portAreaName?: string;
  berthName?: string;
  eta?: string;
  etd?: string;
  ata?: string;
  atd?: string;
}

export interface PortCallsResponse {
  portCalls: PortCall[];
}

export interface VesselDetailsResponse {
  metadata: {
    name?: string;
    callSign?: string;
    imo?: number;
    mmsi?: number;
    shipType?: number;
    draught?: number; // decimeters (raw upstream)
    eta?: number; // packed AIS bitfield (raw upstream)
    destination?: string;
    referencePointA?: number;
    referencePointB?: number;
    referencePointC?: number;
    referencePointD?: number;
  } | null;
  position: Vessel | null;
}

export interface SeaStateFeature {
  siteNumber: number;
  geometry: { coordinates: [number, number] } | null;
  properties: {
    siteName: string;
    siteType: string;
    lastUpdate: string;
    seaState: string | null;
    trend: string | null;
    windWaveDir: number | null;
    confidence: string | null;
    heelAngle: number | null;
    lightStatus: string | null;
    temperature: number | null;
  };
}

export interface SeaStateResponse {
  features: SeaStateFeature[];
}

/**
 * One FMI marine observation site. Every measurement is optional: a wave buoy
 * has no anemometer, a mareograph has no wave sensor, and the buoys are lifted
 * out of the water for the winter. Absent must stay distinguishable from zero.
 *
 * Mirrors fmi.Station in backend/internal/meri/fmi — change one, change both.
 */
export interface SeaConditionsStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kinds: SeaConditionKind[];
  observed: string;
  waveHeight?: number; // significant wave height, m
  wavePeriod?: number; // modal period, s
  waveDir?: number; // degrees the waves travel FROM
  waterTemp?: number; // °C
  windSpeed?: number; // m/s, 10 min mean
  windGust?: number; // m/s, 10 min max
  windDir?: number; // degrees the wind blows FROM
  airTemp?: number; // °C
  waterLevel?: number; // cm from theoretical mean sea level
}

export type SeaConditionKind = 'wave' | 'wind' | 'waterLevel';

/** Per-source status, so an empty layer can be explained rather than guessed at. */
export interface SeaConditionsSource {
  key: SeaConditionKind;
  ok: boolean;
  stations: number;
  error?: string;
}

export interface SeaConditionsResponse {
  updated: string;
  stations: SeaConditionsStation[];
  sources: SeaConditionsSource[];
}

export interface AtonFaultFeature {
  geometry: { coordinates: [number, number] } | null;
  properties: {
    id: number;
    entry_timestamp: string;
    type: string;
    state: string;
    fixed: boolean;
    aton_name_fi: string;
    aton_type: string;
    fairway_name_fi: string;
    area_description: string;
  };
}

export interface AtonFaultsResponse {
  features: AtonFaultFeature[];
}
