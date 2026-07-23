import type {
  Port,
  PortCallsResponse,
  VesselDetailsResponse,
  SeaStateResponse,
  AtonFaultsResponse,
  VesselTrailResponse,
  FleetReplayResponse,
} from '../types';

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

export function fetchPorts(): Promise<Port[]> {
  return getJSON('/api/meri/ports');
}

export function fetchPortCalls(locode: string): Promise<PortCallsResponse> {
  return getJSON(`/api/meri/port-calls/${encodeURIComponent(locode)}`);
}

export function fetchVesselDetails(mmsi: number): Promise<VesselDetailsResponse> {
  return getJSON(`/api/meri/vessel/${mmsi}`);
}

export function fetchVesselTrail(
  mmsi: number,
  fromSec: number,
  maxPoints = 2000
): Promise<VesselTrailResponse> {
  const params = new URLSearchParams({
    from: String(Math.floor(fromSec)),
    maxPoints: String(maxPoints),
  });
  return getJSON(`/api/meri/vessel/${mmsi}/trail?${params.toString()}`);
}

export function fetchFleetReplay(
  fromSec: number,
  toSec: number
): Promise<FleetReplayResponse> {
  const params = new URLSearchParams({
    from: String(Math.floor(fromSec)),
    to: String(Math.floor(toSec)),
  });
  return getJSON(`/api/meri/replay?${params.toString()}`);
}

export function fetchSeaState(): Promise<SeaStateResponse> {
  return getJSON('/api/meri/sea-state');
}

export function fetchAtonFaults(): Promise<AtonFaultsResponse> {
  return getJSON('/api/meri/aton-faults');
}
