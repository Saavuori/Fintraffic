import type { Theme } from './theme';

export interface ChargingConnector {
  standard: string;
  powerType: string;
  maxPowerKw: number;
  count: number;
  pricePerKwh?: number;
  currency?: string;
}

export interface ChargingStation {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  operator?: string;
  address?: string;
  city?: string;
  website?: string;
  connectors: ChargingConnector[];
  maxPowerKw: number;
  total: number;
  /** EVSEs currently reporting AVAILABLE; undefined when no live status exists. */
  available?: number;
}

export type ChargingLevel = 'available' | 'limited' | 'full' | 'unknown';

export function chargingLevel(station: ChargingStation): ChargingLevel {
  if (station.available == null || station.total <= 0) return 'unknown';
  if (station.available <= 0) return 'full';
  if (station.available / station.total > 0.3) return 'available';
  return 'limited';
}

export const CHARGING_COLORS: Record<ChargingLevel, string> = {
  available: '#27ae60',
  limited: '#e67e22',
  full: '#c0392b',
  unknown: '#8e6db0',
};

const CHARGING_COLORS_LIGHT: Record<ChargingLevel, string> = {
  ...CHARGING_COLORS,
  limited: '#c2620f',
  unknown: '#6f4f95',
};

export function chargingColors(theme: Theme): Record<ChargingLevel, string> {
  return theme === 'light' ? CHARGING_COLORS_LIGHT : CHARGING_COLORS;
}

/** Human-friendly plug label, e.g. "IEC_62196_T2" -> "Type 2". */
const STANDARD_LABELS: Record<string, string> = {
  IEC_62196_T2: 'Type 2',
  IEC_62196_T2_COMBO: 'CCS (Type 2)',
  IEC_62196_T1: 'Type 1',
  IEC_62196_T1_COMBO: 'CCS (Type 1)',
  CHADEMO: 'CHAdeMO',
  DOMESTIC_F: 'Schuko',
  TESLA_S: 'Tesla',
};

export function connectorLabel(c: ChargingConnector): string {
  const std = STANDARD_LABELS[c.standard] ?? c.standard;
  const kw = c.maxPowerKw >= 1 ? `${Math.round(c.maxPowerKw)} kW` : '';
  const parts = [std, kw].filter(Boolean).join(' · ');
  return c.count > 1 ? `${parts} ×${c.count}` : parts;
}

export function priceLabel(c: ChargingConnector): string | null {
  if (c.pricePerKwh == null) return null;
  const cur = c.currency === 'EUR' ? '€' : c.currency ? ` ${c.currency}` : '';
  return c.currency === 'EUR' ? `${c.pricePerKwh.toFixed(2)} ${cur}/kWh` : `${c.pricePerKwh.toFixed(2)}${cur}/kWh`;
}

export function availabilityText(station: ChargingStation): string {
  if (station.available == null) return `${station.total} charging point(s)`;
  return `${station.available} / ${station.total} available`;
}
