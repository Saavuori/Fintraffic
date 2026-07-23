export type ShipCategory =
  | 'passenger'
  | 'cargo'
  | 'tanker'
  | 'highspeed'
  | 'special'
  | 'sailing'
  | 'military'
  | 'other';

export const CATEGORY_COLORS: Record<ShipCategory, string> = {
  passenger: '#4da3ff',
  cargo: '#37c977',
  tanker: '#ff5c5c',
  highspeed: '#e05ce0',
  special: '#fdcb6e',
  sailing: '#a78bfa',
  military: '#93a37a',
  other: '#94a3b8',
};

export const CATEGORY_LABELS: Record<ShipCategory, string> = {
  passenger: 'Passenger',
  cargo: 'Cargo',
  tanker: 'Tanker',
  highspeed: 'High-speed',
  special: 'Tug / Special',
  sailing: 'Sailing / Pleasure',
  military: 'Military',
  other: 'Other',
};

export const ALL_CATEGORIES: ShipCategory[] = [
  'passenger',
  'cargo',
  'tanker',
  'highspeed',
  'special',
  'sailing',
  'military',
  'other',
];

/** Maps an AIS ship type code to a display category. */
export function categorize(shipType?: number): ShipCategory {
  const t = shipType ?? 0;
  if (t >= 60 && t <= 69) return 'passenger';
  if (t >= 70 && t <= 79) return 'cargo';
  if (t >= 80 && t <= 89) return 'tanker';
  if (t >= 40 && t <= 49) return 'highspeed';
  if (t === 35) return 'military';
  if (t === 36 || t === 37) return 'sailing';
  if ((t >= 31 && t <= 34) || (t >= 50 && t <= 58)) return 'special';
  return 'other';
}

/** Human-readable AIS ship type, more specific than the category. */
export function shipTypeText(shipType?: number): string {
  const t = shipType ?? 0;
  const table: Record<number, string> = {
    30: 'Fishing',
    31: 'Towing',
    32: 'Towing (long/wide)',
    33: 'Dredging / underwater ops',
    34: 'Diving ops',
    35: 'Military ops',
    36: 'Sailing vessel',
    37: 'Pleasure craft',
    50: 'Pilot vessel',
    51: 'Search and rescue',
    52: 'Tug',
    53: 'Port tender',
    54: 'Anti-pollution',
    55: 'Law enforcement',
    58: 'Medical transport',
  };
  if (table[t]) return table[t];
  if (t >= 40 && t <= 49) return 'High-speed craft';
  if (t >= 60 && t <= 69) return 'Passenger ship';
  if (t >= 70 && t <= 79) return 'Cargo ship';
  if (t >= 80 && t <= 89) return 'Tanker';
  if (t >= 90 && t <= 99) return 'Other ship type';
  return 'Unknown type';
}

/** AIS navigational status descriptions. */
export function navStatText(navStat: number): string {
  const table: Record<number, string> = {
    0: 'Under way (engine)',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Under way (sailing)',
    11: 'Towing astern',
    12: 'Pushing ahead',
    14: 'AIS-SART active',
    15: 'Undefined',
  };
  return table[navStat] ?? `Status ${navStat}`;
}

/** A vessel is "stationary" for rendering purposes when it barely moves or is anchored/moored/aground. */
export function isStationary(sog: number, navStat: number): boolean {
  return sog < 0.2 || navStat === 1 || navStat === 5 || navStat === 6;
}
