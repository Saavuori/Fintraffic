import type { SeaConditionsStation } from '../types';

/**
 * Scales and formatting for the FMI sea conditions layer.
 *
 * Colours follow the two scales mariners already read the sea by rather than
 * an arbitrary ramp: wave height breaks on the Douglas sea scale, wind on
 * Beaufort. That way a colour change on the map lines up with a change in the
 * words a forecast would use.
 */

/** Douglas sea scale (wind sea), by significant wave height in metres. */
const DOUGLAS: { min: number; degree: number; label: string }[] = [
  { min: 0, degree: 0, label: 'Calm (glassy)' },
  { min: 0.1, degree: 1, label: 'Calm (rippled)' },
  { min: 0.5, degree: 2, label: 'Smooth' },
  { min: 1.25, degree: 3, label: 'Slight' },
  { min: 2.5, degree: 4, label: 'Moderate' },
  { min: 4, degree: 5, label: 'Rough' },
  { min: 6, degree: 6, label: 'Very rough' },
  { min: 9, degree: 7, label: 'High' },
  { min: 14, degree: 8, label: 'Very high' },
];

export function douglas(waveHeight: number): { degree: number; label: string } {
  let out = DOUGLAS[0];
  for (const step of DOUGLAS) {
    if (waveHeight >= step.min) out = step;
  }
  return { degree: out.degree, label: out.label };
}

/** Beaufort force, by 10-minute mean wind speed in m/s. */
const BEAUFORT: { min: number; force: number; label: string }[] = [
  { min: 0, force: 0, label: 'Calm' },
  { min: 0.5, force: 1, label: 'Light air' },
  { min: 1.6, force: 2, label: 'Light breeze' },
  { min: 3.4, force: 3, label: 'Gentle breeze' },
  { min: 5.5, force: 4, label: 'Moderate breeze' },
  { min: 8, force: 5, label: 'Fresh breeze' },
  { min: 10.8, force: 6, label: 'Strong breeze' },
  { min: 13.9, force: 7, label: 'Near gale' },
  { min: 17.2, force: 8, label: 'Gale' },
  { min: 20.8, force: 9, label: 'Strong gale' },
  { min: 24.5, force: 10, label: 'Storm' },
  { min: 28.5, force: 11, label: 'Violent storm' },
  { min: 32.7, force: 12, label: 'Hurricane force' },
];

export function beaufort(windSpeed: number): { force: number; label: string } {
  let out = BEAUFORT[0];
  for (const step of BEAUFORT) {
    if (windSpeed >= step.min) out = step;
  }
  return { force: out.force, label: out.label };
}

/**
 * Colour ramps, as [value, colour, value, colour, ...] ready to splice into a
 * MapLibre `interpolate` expression. The breakpoints are Douglas and Beaufort
 * boundaries, so the ramp changes hue exactly where the described sea changes.
 */
export const WAVE_RAMP: (number | string)[] = [
  0, '#22d3ee', // calm
  0.5, '#2dd4bf', // smooth
  1.25, '#facc15', // slight
  2.5, '#fb923c', // moderate
  4, '#ef4444', // rough
  6, '#d946ef', // very rough and beyond
];

export const WIND_RAMP: (number | string)[] = [
  0, '#22d3ee',
  5.5, '#2dd4bf', // moderate breeze
  10.8, '#facc15', // strong breeze
  13.9, '#fb923c', // near gale
  17.2, '#ef4444', // gale
  24.5, '#d946ef', // storm and beyond
];

/** Picks the colour a ramp would give, for legends and other non-map UI. */
export function rampColor(ramp: (number | string)[], value: number): string {
  let color = ramp[1] as string;
  for (let i = 0; i < ramp.length; i += 2) {
    if (value >= (ramp[i] as number)) color = ramp[i + 1] as string;
  }
  return color;
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** 207° -> "SSW". Wind and wave directions are both "coming from". */
export function compass(degrees: number): string {
  const i = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

/** "5 min ago" / "2 h ago" — station reports are minutes old, not seconds. */
export function observedAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * The one number a station is best summarised by, used for the map label.
 * Wave height wins over wind because it's the scarcer and more consequential
 * reading; sea level is all a mareograph has to offer.
 */
export function headlineLabel(s: SeaConditionsStation): string {
  if (s.waveHeight !== undefined) return `${s.waveHeight.toFixed(1)} m`;
  if (s.windSpeed !== undefined) return `${Math.round(s.windSpeed)} m/s`;
  if (s.waterLevel !== undefined) return `${s.waterLevel > 0 ? '+' : ''}${Math.round(s.waterLevel)} cm`;
  return '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function row(label: string, value: string): string {
  return `<div><span>${label}</span><b>${value}</b></div>`;
}

export function seaConditionsPopupHtml(s: SeaConditionsStation): string {
  const rows: string[] = [];

  if (s.waveHeight !== undefined) {
    const d = douglas(s.waveHeight);
    rows.push(row('Wave height', `${s.waveHeight.toFixed(1)} m`));
    rows.push(row('Sea', `${d.label} (${d.degree})`));
  }
  if (s.wavePeriod !== undefined) rows.push(row('Period', `${s.wavePeriod.toFixed(1)} s`));
  if (s.waveDir !== undefined) {
    rows.push(row('Waves from', `${compass(s.waveDir)} ${Math.round(s.waveDir)}&deg;`));
  }

  if (s.windSpeed !== undefined) {
    const b = beaufort(s.windSpeed);
    const gust = s.windGust !== undefined ? ` (gust ${s.windGust.toFixed(1)})` : '';
    rows.push(row('Wind', `${s.windSpeed.toFixed(1)} m/s${gust}`));
    rows.push(row('Force', `${b.label} (${b.force})`));
  }
  if (s.windDir !== undefined) {
    rows.push(row('Wind from', `${compass(s.windDir)} ${Math.round(s.windDir)}&deg;`));
  }

  if (s.waterLevel !== undefined) {
    const sign = s.waterLevel > 0 ? '+' : '';
    rows.push(row('Sea level', `${sign}${s.waterLevel.toFixed(0)} cm`));
  }
  if (s.waterTemp !== undefined) rows.push(row('Water', `${s.waterTemp.toFixed(1)} &deg;C`));
  if (s.airTemp !== undefined) rows.push(row('Air', `${s.airTemp.toFixed(1)} &deg;C`));

  const age = s.observed ? observedAge(s.observed) : '';
  const footer = age ? `<small>FMI &middot; ${esc(age)}</small>` : '<small>FMI</small>';
  return `<div class="marine-popup"><h4>${esc(s.name)}</h4>${rows.join('')}${footer}</div>`;
}
