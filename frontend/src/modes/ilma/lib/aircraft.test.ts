import { describe, it, expect } from 'vitest';
import {
  type Aircraft,
  advance,
  aircraftAround,
  aircraftTitle,
  altitudeShort,
  altitudeText,
  distanceKm,
  trackText,
  verticalText,
  verticalTrend,
} from './aircraft';

const base: Aircraft = {
  hex: '461e18',
  callsign: 'FIN2JA',
  group: 'airline',
  latitude: 60.32,
  longitude: 24.96,
  onGround: false,
  source: 'adsb',
  timestamp: 0,
};

describe('aircraftTitle', () => {
  it('prefers the flight, then the tail, then the address', () => {
    expect(aircraftTitle(base)).toBe('FIN2JA');
    expect(aircraftTitle({ ...base, callsign: '', registration: 'OH-LKI' })).toBe('OH-LKI');
    expect(aircraftTitle({ ...base, callsign: '' })).toBe('461E18');
  });
});

describe('altitude formatting', () => {
  it('uses flight levels above the transition altitude and feet below', () => {
    expect(altitudeShort({ altitudeFt: 39000, onGround: false })).toBe('FL390');
    expect(altitudeShort({ altitudeFt: 5000, onGround: false })).toBe('FL050');
    expect(altitudeShort({ altitudeFt: 2475, onGround: false })).toBe('2500 ft');
    expect(altitudeShort({ altitudeFt: -75, onGround: false })).toBe('0 ft');
    expect(altitudeShort({ onGround: true })).toBe('GND');
    expect(altitudeShort({ onGround: false })).toBe('');
  });

  it('groups thousands in the long form', () => {
    expect(altitudeText({ altitudeFt: 39000, onGround: false })).toBe('39 000 ft');
    expect(altitudeText({ onGround: true })).toBe('On ground');
  });
});

describe('vertical rate', () => {
  it('treats small rates as level', () => {
    expect(verticalTrend(200)).toBe('level');
    expect(verticalTrend(undefined)).toBe('level');
    expect(verticalTrend(1500)).toBe('climb');
    expect(verticalTrend(-960)).toBe('descend');
    expect(verticalText(-960)).toBe('↓ 960 ft/min');
  });
});

describe('trackText', () => {
  it('names the nearest compass point', () => {
    expect(trackText(0)).toBe('0° N');
    expect(trackText(65)).toBe('65° NE');
    expect(trackText(80)).toBe('80° E');
    expect(trackText(359.6)).toBe('0° N');
    expect(trackText(225)).toBe('225° SW');
  });
});

describe('advance', () => {
  it('moves due north by speed × time', () => {
    // 360 kt for 10 s is one nautical mile: 1/60 of a degree of latitude.
    const p = advance(60, 25, 360, 0, 10);
    expect(p.lat - 60).toBeCloseTo(1 / 60, 3);
    expect(p.lng).toBeCloseTo(25, 6);
  });

  it('stretches longitude by latitude when moving east', () => {
    const p = advance(60, 25, 360, 90, 10);
    // At 60°N a degree of longitude is half as long, so the same mile is twice the degrees.
    expect(p.lng - 25).toBeCloseTo(2 / 60, 3);
  });
});

describe('aircraftAround', () => {
  const efhk = { latitude: 60.3184, longitude: 24.9633, elevationFt: 179 };

  it('keeps taxiing and low nearby traffic, nearest first, and drops overflights', () => {
    const taxiing = { ...base, hex: 'a', onGround: true, latitude: 60.32, longitude: 24.96 };
    const onFinal = { ...base, hex: 'b', altitudeFt: 2000, latitude: 60.4, longitude: 24.96 };
    const cruising = { ...base, hex: 'c', altitudeFt: 36000, latitude: 60.32, longitude: 24.97 };
    const elsewhere = { ...base, hex: 'd', altitudeFt: 1500, latitude: 61.5, longitude: 23.6 };

    const around = aircraftAround(efhk, [onFinal, cruising, elsewhere, taxiing]);
    expect(around.map(x => x.aircraft.hex)).toEqual(['a', 'b']);
    expect(around[1].km).toBeCloseTo(distanceKm({ lat: 60.3184, lng: 24.9633 }, { lat: 60.4, lng: 24.96 }), 6);
  });
});
