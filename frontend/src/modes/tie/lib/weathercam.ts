import type { Theme } from './theme';

export interface WeathercamPreset {
  id: string;
  imageUrl: string;
}

export interface WeatherReading {
  label: string;
  value: number;
  unit?: string;
  /** Digitraffic's coded description for enumerated sensors (e.g. road condition "Märkä"). */
  description?: string;
}

export interface WeatherObservation {
  stationId: number;
  stationName: string;
  distanceKm: number;
  measuredTime?: string;
  readings: WeatherReading[];
}

export interface WeathercamStation {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  presets: WeathercamPreset[];
  /** Current weather from the nearest road weather station; absent if unavailable. */
  weather?: WeatherObservation;
}

export const WEATHERCAM_COLOR = '#00bcd4';

/** Cyan is bright enough to vanish on the light basemap — deepen it there. */
export function weathercamColor(theme: Theme): string {
  return theme === 'light' ? '#0097a7' : WEATHERCAM_COLOR;
}

/** Formats one weather reading as a display string, e.g. "18.8 °C" or "3.0 (Märkä)". */
export function formatWeatherReading(reading: WeatherReading): string {
  const parts: string[] = [];
  const unit = reading.unit ? ` ${reading.unit}` : '';
  parts.push(`${reading.value}${unit}`);
  if (reading.description) parts.push(`(${reading.description})`);
  return parts.join(' ');
}
