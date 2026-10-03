import type { Theme } from './theme';

export interface WeathercamPreset {
  id: string;
  imageUrl: string;
}

export interface WeatherReading {
  /** Digitraffic weather sensor id, e.g. 27 road condition (see WEATHER_SENSOR). */
  sensorId: number;
  label: string;
  value: number;
  unit?: string;
  /** Digitraffic's coded description for enumerated sensors (e.g. road condition "Wet"). */
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

/** Formats one weather reading as a display string, e.g. "18.8 °C" or "Wet" —
 *  an enumerated sensor's code means nothing on its own, so only its
 *  description is shown. */
export function formatWeatherReading(reading: WeatherReading): string {
  if (reading.description) return reading.description;
  const unit = reading.unit ? ` ${reading.unit}` : '';
  return `${reading.value}${unit}`;
}
