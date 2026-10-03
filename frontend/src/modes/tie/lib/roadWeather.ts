import type { Theme } from './theme';
import type { WeatherReading } from './weathercam';

// Road weather stations (Digitraffic /api/weather): ~500 roadside stations
// measuring the road surface itself — temperature, condition, friction — plus
// Digitraffic's own road-weather warning. The backend serves a curated set of
// readings per station (see curatedWeatherSensors), keyed by sensor id.

export interface RoadWeatherStation {
  id: number;
  name: string;
  longitude: number;
  latitude: number;
  measuredTime?: string;
  readings: WeatherReading[];
}

/** Digitraffic weather sensor ids the layer grades and headlines by. */
export const WEATHER_SENSOR = {
  roadTemp: 3, // TIE_1
  airTemp: 1, // ILMA
  condition: 27, // KELI_1
  warning: 29, // VAROITUS_1
  friction: 176, // KITKA1
} as const;

export function reading(station: RoadWeatherStation, sensorId: number): WeatherReading | undefined {
  return station.readings.find(r => r.sensorId === sensorId);
}

export type RoadWeatherLevel = 'ok' | 'caution' | 'hazard' | 'unknown';
export const ROAD_WEATHER_LEVELS: RoadWeatherLevel[] = ['ok', 'caution', 'hazard', 'unknown'];

const RANK: Record<RoadWeatherLevel, number> = { unknown: 0, ok: 1, caution: 2, hazard: 3 };

function worse(a: RoadWeatherLevel, b: RoadWeatherLevel): RoadWeatherLevel {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Grades a station by the worst of three independent signals:
 * - Digitraffic's road-weather warning (VAROITUS_1): 0 OK, 1 Beware, 2 Alarm,
 *   3 Frost, 4 Rain — the operator's own model, so it leads.
 * - Road condition (KELI_1): 7 Ice is a hazard; 5 Frost, 6 Snow, 9 Slushy call
 *   for caution. 0 means the sensor is faulty and is ignored.
 * - Friction (KITKA1, µ): dry asphalt reads ~0.8, wet ~0.6–0.7, snow ~0.3–0.4,
 *   ice below that; under 0.3 is a hazard, under 0.5 caution.
 * A station with none of the three is 'unknown' — temperature alone isn't
 * graded, since a wet road at 0 °C is exactly what the warning already models.
 */
export function roadWeatherLevel(station: RoadWeatherStation): RoadWeatherLevel {
  let level: RoadWeatherLevel = 'unknown';

  const warning = reading(station, WEATHER_SENSOR.warning)?.value;
  if (warning != null) {
    level = worse(level, warning === 2 ? 'hazard' : warning === 0 ? 'ok' : 'caution');
  }

  const condition = reading(station, WEATHER_SENSOR.condition)?.value;
  if (condition != null && condition !== 0) {
    level = worse(level, condition === 7 ? 'hazard' : [5, 6, 9].includes(condition) ? 'caution' : 'ok');
  }

  const friction = reading(station, WEATHER_SENSOR.friction)?.value;
  if (friction != null && friction > 0) {
    level = worse(level, friction < 0.3 ? 'hazard' : friction < 0.5 ? 'caution' : 'ok');
  }

  return level;
}

export const ROAD_WEATHER_LEVEL_LABELS: Record<RoadWeatherLevel, string> = {
  ok: 'Normal',
  caution: 'Caution',
  hazard: 'Slippery',
  unknown: 'No condition data',
};

const ROAD_WEATHER_COLORS: Record<RoadWeatherLevel, string> = {
  ok: '#2ecc71',
  caution: '#f1c40f',
  hazard: '#e74c3c',
  unknown: '#7f8c8d',
};

const ROAD_WEATHER_COLORS_LIGHT: Record<RoadWeatherLevel, string> = {
  ...ROAD_WEATHER_COLORS,
  caution: '#b7860b',
  unknown: '#5b6b7a',
};

export function roadWeatherColors(theme: Theme): Record<RoadWeatherLevel, string> {
  return theme === 'light' ? ROAD_WEATHER_COLORS_LIGHT : ROAD_WEATHER_COLORS;
}

/** Station ids read like "vt1_Espoo_Nupuri" — road, then place. */
export function weatherStationName(name: string): string {
  return name.replace(/_/g, ' ');
}

function formatTemp(r: WeatherReading | undefined): string | null {
  return r ? `${r.value.toFixed(1)} °C` : null;
}

/** One-line headline: road temperature and condition, e.g. "Road 1.2 °C · Wet". */
export function roadWeatherSummary(station: RoadWeatherStation): string {
  const temp = formatTemp(reading(station, WEATHER_SENSOR.roadTemp));
  const condition = reading(station, WEATHER_SENSOR.condition);
  const parts = [
    temp ? `Road ${temp}` : formatTemp(reading(station, WEATHER_SENSOR.airTemp)),
    condition?.value ? condition.description : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No data';
}
