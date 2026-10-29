import { describe, it, expect } from 'vitest';
import { deadReckon, distanceKm, formatDistanceKm } from './geo';

describe('distanceKm', () => {
  it('is zero between a point and itself', () => {
    expect(distanceKm({ lat: 60.17, lng: 24.94 }, { lat: 60.17, lng: 24.94 })).toBe(0);
  });

  it('measures a degree of latitude as about 111 km', () => {
    expect(distanceKm({ lat: 60, lng: 25 }, { lat: 61, lng: 25 })).toBeCloseTo(111.19, 2);
  });

  it('shrinks a degree of longitude by the cosine of latitude', () => {
    // At 60°N a degree of longitude is half a degree of latitude.
    expect(distanceKm({ lat: 60, lng: 25 }, { lat: 60, lng: 26 })).toBeCloseTo(111.19 / 2, 2);
  });

  it('is symmetric', () => {
    const helsinki = { lat: 60.1699, lng: 24.9384 };
    const tallinn = { lat: 59.437, lng: 24.7536 };
    expect(distanceKm(helsinki, tallinn)).toBeCloseTo(distanceKm(tallinn, helsinki), 9);
  });

  it('stays within a fraction of a percent of great-circle distance over tens of km', () => {
    // Helsinki–Tallinn is 82.15 km by haversine.
    const km = distanceKm({ lat: 60.1699, lng: 24.9384 }, { lat: 59.437, lng: 24.7536 });
    expect(Math.abs(km - 82.15) / 82.15).toBeLessThan(0.005);
  });
});

describe('deadReckon', () => {
  it('moves due north by speed × time', () => {
    // 360 kt for 10 s is one nautical mile: 1/60 of a degree of latitude.
    const p = deadReckon(60, 25, 360, 0, 10);
    expect(p.lat - 60).toBeCloseTo(1 / 60, 3);
    expect(p.lng).toBeCloseTo(25, 6);
  });

  it('stretches longitude by latitude when moving east', () => {
    const p = deadReckon(60, 25, 360, 90, 10);
    // At 60°N a degree of longitude is half as long, so the same mile is twice the degrees.
    expect(p.lng - 25).toBeCloseTo(2 / 60, 3);
  });

  it('lands where distanceKm says it went', () => {
    const p = deadReckon(60, 25, 20, 45, 600);
    // 20 kt for ten minutes is 3.33 nautical miles.
    expect(distanceKm({ lat: 60, lng: 25 }, p)).toBeCloseTo((20 * 1.852) / 6, 2);
  });
});

describe('formatDistanceKm', () => {
  it('uses metres under a kilometre, one decimal under ten, whole km above', () => {
    expect(formatDistanceKm(0.4321)).toBe('432 m');
    expect(formatDistanceKm(3.456)).toBe('3.5 km');
    expect(formatDistanceKm(42.6)).toBe('43 km');
  });
});
