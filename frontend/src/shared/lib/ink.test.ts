import { describe, it, expect } from 'vitest';
import { inkOn } from './ink';

describe('inkOn', () => {
  it('puts dark ink on bright fills', () => {
    expect(inkOn('#fdcb6e')).toBe('#0b1220');
    expect(inkOn('#37c977')).toBe('#0b1220');
    expect(inkOn('#fff')).toBe('#0b1220');
  });

  it('puts white ink on deep fills', () => {
    expect(inkOn('#0369a1')).toBe('#ffffff');
    expect(inkOn('#000')).toBe('#ffffff');
  });

  it('falls back to dark ink for colours it cannot parse', () => {
    expect(inkOn('rgb(0, 0, 0)')).toBe('#0b1220');
    expect(inkOn('')).toBe('#0b1220');
  });
});
