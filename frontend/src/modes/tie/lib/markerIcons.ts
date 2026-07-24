import type maplibregl from 'maplibre-gl';
import { parkingColors } from './parking';
import { weathercamColor } from './weathercam';
import { chargingColors } from './charging';
import { poiColors } from './layers';
import { SPEED_SIGN_RING } from './speedLimits';
import { type Theme, MARKER_STROKE } from './theme';
import { type CongestionLevel, CONGESTION_LEVELS, congestionColors } from './traffic';

// Each POI category gets a distinct silhouette so they can be told apart at a
// glance instead of reading as identically-shaped colored dots. Icons are drawn
// once onto an offscreen canvas and registered with the map via `addImage`, so
// there are no external image assets to ship or fetch.

// Canvas is drawn at 2x and registered with pixelRatio 2, so the marker shows
// at ~SIZE/2 CSS pixels on screen while staying crisp on retina displays.
const SIZE = 44;
const RATIO = 2;
const MARGIN = 6;
const STROKE_WIDTH = 2.5;

type IconImage = { width: number; height: number; data: Uint8ClampedArray };

function render(draw: (ctx: CanvasRenderingContext2D) => void): IconImage {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  draw(ctx);
  const { data, width, height } = ctx.getImageData(0, 0, SIZE, SIZE);
  return { width, height, data };
}

/** Fill the current path with a soft drop shadow, then outline it. */
function paint(ctx: CanvasRenderingContext2D, fill: string, stroke: string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 3;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = STROKE_WIDTH;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Warning triangle — road works. */
function triangleIcon(fill: string, stroke: string): IconImage {
  return render(ctx => {
    const top = MARGIN;
    const bottom = SIZE - MARGIN;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2, top);
    ctx.lineTo(bottom, bottom);
    ctx.lineTo(top, bottom);
    ctx.closePath();
    paint(ctx, fill, stroke);
  });
}

/** Diamond — traffic incidents. */
function diamondIcon(fill: string, stroke: string): IconImage {
  return render(ctx => {
    const min = MARGIN;
    const max = SIZE - MARGIN;
    const mid = SIZE / 2;
    ctx.beginPath();
    ctx.moveTo(mid, min);
    ctx.lineTo(max, mid);
    ctx.lineTo(mid, max);
    ctx.lineTo(min, mid);
    ctx.closePath();
    paint(ctx, fill, stroke);
  });
}

/** Rounded square badge with a "P" glyph — parking, tinted by availability. */
function parkingIcon(fill: string, stroke: string): IconImage {
  return render(ctx => {
    roundRectPath(ctx, MARGIN, MARGIN, SIZE - 2 * MARGIN, SIZE - 2 * MARGIN, 6);
    paint(ctx, fill, stroke);
    ctx.fillStyle = stroke;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', SIZE / 2, SIZE / 2 + 1);
  });
}

/** Camera silhouette (body, viewfinder bump, lens) — weather cameras. */
function cameraIcon(fill: string, stroke: string): IconImage {
  return render(ctx => {
    const bodyY = MARGIN + 6;
    const bodyH = SIZE - MARGIN - bodyY;
    // Viewfinder bump on top of the body.
    roundRectPath(ctx, SIZE / 2 - 6, MARGIN, 12, 7, 2);
    paint(ctx, fill, stroke);
    // Camera body.
    roundRectPath(ctx, MARGIN, bodyY, SIZE - 2 * MARGIN, bodyH, 4);
    paint(ctx, fill, stroke);
    // Lens.
    ctx.beginPath();
    ctx.arc(SIZE / 2, bodyY + bodyH / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(SIZE / 2, bodyY + bodyH / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

/** Rounded square badge with a lightning-bolt glyph — EV charging, tinted by
 *  availability. Same badge family as parking so both read as station markers. */
function chargingIcon(fill: string, stroke: string): IconImage {
  return render(ctx => {
    roundRectPath(ctx, MARGIN, MARGIN, SIZE - 2 * MARGIN, SIZE - 2 * MARGIN, 6);
    paint(ctx, fill, stroke);
    const cx = SIZE / 2;
    const top = MARGIN + 5;
    const bottom = SIZE - MARGIN - 5;
    const mid = SIZE / 2;
    ctx.beginPath();
    ctx.moveTo(cx + 5, top);
    ctx.lineTo(cx - 7, mid + 2);
    ctx.lineTo(cx - 1, mid + 2);
    ctx.lineTo(cx - 5, bottom);
    ctx.lineTo(cx + 8, mid - 3);
    ctx.lineTo(cx + 1, mid - 3);
    ctx.lineTo(cx + 6, top);
    ctx.closePath();
    ctx.fillStyle = stroke;
    ctx.fill();
  });
}

/** Disc split down the middle — a TMS station, with each half tinted by one
 *  direction's congestion level so a road that's fine one way and slow the
 *  other doesn't get hidden behind a single worst-case color. The split is
 *  rotated (via icon-rotate, map-aligned) to the station's road bearing, so
 *  the divider runs parallel to the road — visually separating the two
 *  carriageways the way they actually sit side by side. */
function stationIcon(dir1Color: string, dir2Color: string, stroke: string): IconImage {
  return render(ctx => {
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE / 2 - MARGIN;

    // Drop shadow for the whole disc, drawn before the halves are clipped in
    // so it isn't cut off along with them.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = dir1Color;
    ctx.fillRect(cx - r, cy - r, r, r * 2);
    ctx.fillStyle = dir2Color;
    ctx.fillRect(cx, cy - r, r, r * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  });
}

/** MapLibre image id for a station's two-direction icon; pairs with the
 *  icon-image concat expression in the stations layer. */
export function stationIconId(dir1: CongestionLevel, dir2: CongestionLevel): string {
  return `station-${dir1}-${dir2}-icon`;
}

/** Red-ringed white disc with the limit baked in — a miniature speed-limit
 *  sign. One image per distinct displayed value, registered on demand (see
 *  registerSpeedLimitIcon), since baking the number avoids depending on the
 *  basemap's glyph stack for a text-field. */
function speedSignIcon(limit: number): IconImage {
  return render(ctx => {
    const cx = SIZE / 2;
    const r = SIZE / 2 - MARGIN;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    paint(ctx, '#ffffff', SPEED_SIGN_RING);
    // The real sign's red border is far wider than the hairline paint() draws.
    ctx.beginPath();
    ctx.arc(cx, cx, r - 2.5, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = SPEED_SIGN_RING;
    ctx.stroke();
    ctx.fillStyle = '#111111';
    ctx.font = limit >= 100 ? 'bold 13px sans-serif' : 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(limit), cx, cx + 1);
  });
}

/** MapLibre image id for a given displayed limit; pairs with the icon-image
 *  concat expression in the speed-limit layer. */
export function speedLimitIconId(limit: number): string {
  return `speedlimit-${limit}-icon`;
}

/** Register the sign image for one displayed limit if it isn't registered yet.
 *  Called from the data fetch, since the set of displayed values is only known
 *  at runtime (and a style swap drops previously registered images). */
export function registerSpeedLimitIcon(m: maplibregl.Map, limit: number) {
  const id = speedLimitIconId(limit);
  if (!m.hasImage(id)) m.addImage(id, speedSignIcon(limit), { pixelRatio: RATIO });
}

export const MARKER_ICONS = {
  roadworks: 'roadworks-icon',
  incidents: 'incidents-icon',
  weathercam: 'weathercam-icon',
  parking: {
    plenty: 'parking-plenty-icon',
    limited: 'parking-limited-icon',
    full: 'parking-full-icon',
    unknown: 'parking-unknown-icon',
  },
  charging: {
    available: 'charging-available-icon',
    limited: 'charging-limited-icon',
    full: 'charging-full-icon',
    unknown: 'charging-unknown-icon',
  },
} as const;

/**
 * Draw and register every POI marker image on the map, tinted and outlined for
 * the given theme. Call after each style load: MapLibre drops registered images
 * along with the style, so a theme switch naturally redraws them (the hasImage
 * guard only skips images that survived).
 */
export function registerMarkerIcons(m: maplibregl.Map, theme: Theme) {
  const add = (id: string, image: IconImage) => {
    if (!m.hasImage(id)) m.addImage(id, image, { pixelRatio: RATIO });
  };

  const stroke = MARKER_STROKE[theme];
  const poi = poiColors(theme);
  const parking = parkingColors(theme);
  const charging = chargingColors(theme);
  const congestion = congestionColors(theme);

  for (const dir1 of CONGESTION_LEVELS) {
    for (const dir2 of CONGESTION_LEVELS) {
      add(stationIconId(dir1, dir2), stationIcon(congestion[dir1], congestion[dir2], stroke));
    }
  }

  add(MARKER_ICONS.roadworks, triangleIcon(poi.roadworks, stroke));
  add(MARKER_ICONS.incidents, diamondIcon(poi.incidents, stroke));
  add(MARKER_ICONS.weathercam, cameraIcon(weathercamColor(theme), stroke));
  add(MARKER_ICONS.parking.plenty, parkingIcon(parking.plenty, stroke));
  add(MARKER_ICONS.parking.limited, parkingIcon(parking.limited, stroke));
  add(MARKER_ICONS.parking.full, parkingIcon(parking.full, stroke));
  add(MARKER_ICONS.parking.unknown, parkingIcon(parking.unknown, stroke));
  add(MARKER_ICONS.charging.available, chargingIcon(charging.available, stroke));
  add(MARKER_ICONS.charging.limited, chargingIcon(charging.limited, stroke));
  add(MARKER_ICONS.charging.full, chargingIcon(charging.full, stroke));
  add(MARKER_ICONS.charging.unknown, chargingIcon(charging.unknown, stroke));
}
