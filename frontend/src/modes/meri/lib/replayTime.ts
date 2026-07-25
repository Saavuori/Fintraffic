/** Time formatting shared by the replay transports (top bar, fleet, mobile). */

/** "14:32" — enough for the fleet replay, whose widest window is six hours. */
export function fmtClock(epochSec: number): string {
  if (!epochSec) return '--:--';
  return new Date(epochSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A track playhead can sit days back, so the date is part of the readout — a
 *  bare clock would be ambiguous over anything but the 1h window. */
export function fmtStamp(epochSec: number): string {
  if (!epochSec) return '--:--';
  return new Date(epochSec * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 h 12 min" / "6 d 4 h" — how much recorded time the track covers. */
export function fmtSpan(sec: number): string {
  if (sec <= 0) return '';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} d${h > 0 ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${m > 0 ? ` ${m} min` : ''}`;
  return `${m} min`;
}
