import type {
  Port,
  PortCallsResponse,
  VesselDetailsResponse,
  SeaStateResponse,
  AtonFaultsResponse,
  VersionResponse,
} from '../types';

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

export function fetchPorts(): Promise<Port[]> {
  return getJSON('/api/v1/ports');
}

export function fetchPortCalls(locode: string): Promise<PortCallsResponse> {
  return getJSON(`/api/v1/port-calls/${encodeURIComponent(locode)}`);
}

export function fetchVesselDetails(mmsi: number): Promise<VesselDetailsResponse> {
  return getJSON(`/api/v1/vessel/${mmsi}`);
}

export function fetchSeaState(): Promise<SeaStateResponse> {
  return getJSON('/api/v1/sea-state');
}

export function fetchAtonFaults(): Promise<AtonFaultsResponse> {
  return getJSON('/api/v1/aton-faults');
}

export function fetchVersionInfo(): Promise<VersionResponse> {
  return getJSON('/api/v1/version');
}
