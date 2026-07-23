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

export interface VersionResponse {
  version: string;
  build_date: string;
  git_sha: string;
}
