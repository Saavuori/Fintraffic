import { describe, it, expect } from 'vitest';
import { roadWeatherLevel, roadWeatherSummary, WEATHER_SENSOR, type RoadWeatherStation } from './roadWeather';
import { maintenanceCategory, taskLabel } from './maintenance';
import type { WeatherReading } from './weathercam';

function station(readings: Partial<Record<keyof typeof WEATHER_SENSOR, Partial<WeatherReading>>>): RoadWeatherStation {
  return {
    id: 1001,
    name: 'vt1_Espoo_Nupuri',
    longitude: 24.6,
    latitude: 60.2,
    readings: Object.entries(readings).map(([key, r]) => ({
      sensorId: WEATHER_SENSOR[key as keyof typeof WEATHER_SENSOR],
      label: key,
      value: 0,
      ...r,
    })),
  };
}

describe('roadWeatherLevel', () => {
  it('is unknown without warning, condition or friction', () => {
    expect(roadWeatherLevel(station({ roadTemp: { value: -3 } }))).toBe('unknown');
  });

  it('follows the Digitraffic warning', () => {
    expect(roadWeatherLevel(station({ warning: { value: 0 } }))).toBe('ok');
    expect(roadWeatherLevel(station({ warning: { value: 1 } }))).toBe('caution');
    expect(roadWeatherLevel(station({ warning: { value: 2 } }))).toBe('hazard');
    expect(roadWeatherLevel(station({ warning: { value: 3 } }))).toBe('caution');
  });

  it('takes the worst signal, so ice outranks an OK warning', () => {
    expect(roadWeatherLevel(station({ warning: { value: 0 }, condition: { value: 7 } }))).toBe('hazard');
    expect(roadWeatherLevel(station({ warning: { value: 0 }, friction: { value: 0.42 } }))).toBe('caution');
    expect(roadWeatherLevel(station({ condition: { value: 3 }, friction: { value: 0.25 } }))).toBe('hazard');
  });

  it('ignores a faulty condition sensor', () => {
    expect(roadWeatherLevel(station({ condition: { value: 0 } }))).toBe('unknown');
  });
});

describe('roadWeatherSummary', () => {
  it('headlines road temperature and condition', () => {
    expect(
      roadWeatherSummary(station({ roadTemp: { value: -1.24 }, condition: { value: 6, description: 'Snow' } }))
    ).toBe('Road -1.2 °C · Snow');
  });

  it('falls back to air temperature', () => {
    expect(roadWeatherSummary(station({ airTemp: { value: 4 } }))).toBe('4.0 °C');
  });
});

describe('maintenanceCategory', () => {
  it('ranks ploughing over gritting', () => {
    expect(maintenanceCategory(['SALTING', 'PLOUGHING_AND_SLUSH_REMOVAL'])).toBe('plough');
    expect(maintenanceCategory(['LINE_SANDING'])).toBe('grit');
  });

  it('does not count putting up plough markers as ploughing', () => {
    expect(maintenanceCategory(['SNOW_PLOUGHING_STICKS_AND_SNOW_FENCES'])).toBe('other');
    expect(maintenanceCategory([])).toBe('other');
  });
});

describe('taskLabel', () => {
  it('humanizes task ids and fixes the upstream typo', () => {
    expect(taskLabel('PLOUGHING_AND_SLUSH_REMOVAL')).toBe('Ploughing and slush removal');
    expect(taskLabel('GARBAGE_OLLECTION')).toBe('Garbage collection');
  });
});
