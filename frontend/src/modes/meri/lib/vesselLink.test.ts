import { describe, it, expect } from 'vitest';
import { parseVesselParam, withVesselParam } from './vesselLink';

describe('parseVesselParam', () => {
  it('reads a nine-digit MMSI', () => {
    expect(parseVesselParam('?vessel=230123456')).toBe(230123456);
  });

  it('ignores a missing or malformed value', () => {
    expect(parseVesselParam('')).toBeNull();
    expect(parseVesselParam('?vessel=')).toBeNull();
    expect(parseVesselParam('?vessel=abc')).toBeNull();
    expect(parseVesselParam('?vessel=1234')).toBeNull();
    expect(parseVesselParam('?vessel=1234567890')).toBeNull();
  });
});

describe('withVesselParam', () => {
  it('sets the param and keeps the rest of the URL', () => {
    expect(withVesselParam('https://example.fi/?x=1', 230123456)).toBe(
      'https://example.fi/?x=1&vessel=230123456'
    );
  });

  it('replaces an existing vessel', () => {
    expect(withVesselParam('https://example.fi/?vessel=111111111', 230123456)).toBe(
      'https://example.fi/?vessel=230123456'
    );
  });

  it('removes the param on null', () => {
    expect(withVesselParam('https://example.fi/?vessel=230123456', null)).toBe(
      'https://example.fi/'
    );
  });
});
