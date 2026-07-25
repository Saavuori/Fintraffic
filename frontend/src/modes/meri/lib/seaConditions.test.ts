import { describe, it, expect } from 'vitest';
import {
  beaufort,
  compass,
  douglas,
  headlineLabel,
  rampColor,
  seaConditionsPopupHtml,
  WAVE_RAMP,
} from './seaConditions';
import type { SeaConditionsStation } from '../types';

function station(overrides: Partial<SeaConditionsStation> = {}): SeaConditionsStation {
  return {
    id: '60.1000,25.0000',
    name: 'Test buoy',
    lat: 60,
    lon: 25,
    kinds: ['wave'],
    observed: new Date().toISOString(),
    ...overrides,
  };
}

describe('douglas', () => {
  it('classifies on the scale boundaries, not near them', () => {
    // 1.25 m is exactly the Slight/Moderate boundary.
    expect(douglas(1.24).label).toBe('Smooth');
    expect(douglas(1.25).label).toBe('Slight');
  });

  it('handles a flat calm and a severe sea', () => {
    expect(douglas(0).degree).toBe(0);
    expect(douglas(20).label).toBe('Very high');
  });
});

describe('beaufort', () => {
  it('matches the standard force boundaries', () => {
    expect(beaufort(0.4).force).toBe(0);
    expect(beaufort(8).force).toBe(5);
    expect(beaufort(17.2).label).toBe('Gale');
    expect(beaufort(40).force).toBe(12);
  });
});

describe('compass', () => {
  it('rounds to the nearest of sixteen points', () => {
    expect(compass(0)).toBe('N');
    expect(compass(207)).toBe('SSW');
    expect(compass(90)).toBe('E');
  });

  it('wraps around north in both directions', () => {
    // 350° is nearer N than NNW, and a negative bearing must not index off
    // the end of the table.
    expect(compass(350)).toBe('N');
    expect(compass(-90)).toBe('W');
    expect(compass(720)).toBe('N');
  });
});

describe('rampColor', () => {
  it('returns the colour for the band a value falls in', () => {
    expect(rampColor(WAVE_RAMP, 0)).toBe('#22d3ee');
    expect(rampColor(WAVE_RAMP, 3)).toBe('#fb923c');
    expect(rampColor(WAVE_RAMP, 99)).toBe('#d946ef');
  });
});

describe('headlineLabel', () => {
  it('prefers wave height, then wind, then sea level', () => {
    expect(headlineLabel(station({ waveHeight: 1.44, windSpeed: 9 }))).toBe('1.4 m');
    expect(headlineLabel(station({ windSpeed: 8.9 }))).toBe('9 m/s');
    expect(headlineLabel(station({ waterLevel: 6.3 }))).toBe('+6 cm');
    expect(headlineLabel(station({ waterLevel: -12 }))).toBe('-12 cm');
  });

  it('is empty when a station reported nothing measurable', () => {
    expect(headlineLabel(station({ waterTemp: 17 }))).toBe('');
  });
});

describe('seaConditionsPopupHtml', () => {
  it('omits rows for instruments a station does not have', () => {
    const html = seaConditionsPopupHtml(station({ waveHeight: 0.9, wavePeriod: 6.5 }));
    expect(html).toContain('0.9 m');
    expect(html).toContain('Period');
    // A wave buoy has no anemometer — a missing reading must not render as 0.
    expect(html).not.toContain('Wind');
  });

  it('reports a zero reading rather than dropping it', () => {
    // Flat calm is a real observation, and `0` is falsy.
    const html = seaConditionsPopupHtml(station({ waveHeight: 0, windSpeed: 0 }));
    expect(html).toContain('0.0 m');
    expect(html).toContain('0.0 m/s');
  });

  it('escapes station names rather than injecting them raw', () => {
    const html = seaConditionsPopupHtml(station({ name: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
