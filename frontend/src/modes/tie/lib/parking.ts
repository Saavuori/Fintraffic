import type { Theme } from './theme';

export interface ParkingFacility {
  id: number;
  name: string;
  longitude: number;
  latitude: number;
  type: string;
  status: string;
  capacity: number;
  builtCapacity?: Record<string, number>;
  pricingMethod?: string;
  usages?: string[];
  services?: string[];
  authenticationMethods?: string[];
  paymentMethods?: string[];
  paymentInfo?: string;
  openingHours?: Record<string, string>;
  spacesAvailable?: number;
  openNow?: boolean;
  updatedAt?: string;
}

/** Turn a Digitraffic SCREAMING_SNAKE enum into "Screaming snake" for display. */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Day types in the order Digitraffic uses them, for stable opening-hours display. */
export const DAY_TYPE_ORDER = ['BUSINESS_DAY', 'SATURDAY', 'SUNDAY'] as const;

export const DAY_TYPE_LABELS: Record<string, string> = {
  BUSINESS_DAY: 'Weekdays',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

export type ParkingLevel = 'plenty' | 'limited' | 'full' | 'unknown';

/** Fraction of spaces still free (1.0 = empty, 0 = full), or null with no live data. */
export function occupancyRatio(facility: ParkingFacility): number | null {
  if (facility.spacesAvailable == null || facility.capacity <= 0) return null;
  return facility.spacesAvailable / facility.capacity;
}

export function parkingLevel(facility: ParkingFacility): ParkingLevel {
  if (facility.openNow === false) return 'full';
  const ratio = occupancyRatio(facility);
  if (ratio === null) return 'unknown';
  if (ratio > 0.2) return 'plenty';
  if (ratio > 0) return 'limited';
  return 'full';
}

export const PARKING_COLORS: Record<ParkingLevel, string> = {
  plenty: '#2ecc71',
  limited: '#f1c40f',
  full: '#e74c3c',
  unknown: '#7f8c8d',
};

const PARKING_COLORS_LIGHT: Record<ParkingLevel, string> = {
  ...PARKING_COLORS,
  limited: '#b7860b',
  unknown: '#5b6b7a',
};

export function parkingColors(theme: Theme): Record<ParkingLevel, string> {
  return theme === 'light' ? PARKING_COLORS_LIGHT : PARKING_COLORS;
}
