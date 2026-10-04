import type * as maplibregl from 'maplibre-gl';
import type { AircraftGroup } from './aircraft';

// Top-down silhouettes for the map's aircraft layer, nose up (north) on a
// 24-unit grid so `icon-rotate` can turn them to the aircraft's track. Drawn
// here rather than taken from lucide: its plane glyphs are side-on or angled
// at 45°, which reads wrong once rotated. Each shape is a different outline —
// swept wing, straight wing, rotor, delta — so groups are told apart by form
// as well as colour.
const SILHOUETTES: Record<AircraftGroup, string> = {
  airline:
    '<path d="M12 1.5c.9 0 1.5.9 1.5 2.2v5.6l8 4.6v2.1l-8-2.4v4.6l2.4 1.8v1.6L12 20.8l-3.9.8V20l2.4-1.8v-4.6l-8 2.4v-2.1l8-4.6V3.7c0-1.3.6-2.2 1.5-2.2z" fill="#fff"/>',
  general:
    '<path d="M12 2c.8 0 1.2.8 1.2 1.8V7h8.3v3h-8.3v6.2l3 .8v2.4h-3L12 21l-1.2-1.6h-3V17l3-.8V10H2.5V7h8.3V3.8C10.8 2.8 11.2 2 12 2z" fill="#fff"/>',
  rotorcraft:
    '<path d="M4 3l16 14M20 3L4 17" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' +
    '<ellipse cx="12" cy="10" rx="3.2" ry="4.6" fill="#fff"/>' +
    '<path d="M11.2 14h1.6v6.2h-1.6z M9 19.4h6v1.6H9z" fill="#fff"/>',
  military:
    '<path d="M12 1.5l1.6 4.5v4.2l8 6.3v2.2l-8-2.6-.4 2.6 2.6 1.9v1.5L12 21l-3.8 1.1v-1.5l2.6-1.9-.4-2.6-8 2.6v-2.2l8-6.3V6z" fill="#fff"/>',
};

// An airport: a ring with a runway through it, the chart symbol's shape.
const AIRPORT_GLYPH =
  '<circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" stroke-width="2.4"/>' +
  '<path d="M6.5 17.5l11-11" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>';

export const AIRCRAFT_ICON_ID: Record<AircraftGroup, string> = {
  airline: 'aircraft-icon-airline',
  general: 'aircraft-icon-general',
  rotorcraft: 'aircraft-icon-rotorcraft',
  military: 'aircraft-icon-military',
};

export const AIRPORT_ICON_ID = 'airport-icon';

const RASTER_SIZE = 64;

function svgMarkup(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
}

function rasterize(svg: string, size: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      resolve(ctx.getImageData(0, 0, size, size));
    };
    img.onerror = () => reject(new Error('Failed to rasterize icon SVG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Registers every map pictogram as an SDF image, so `icon-color` and
 * `icon-halo-color` can tint it per group and theme. `setStyle()` drops
 * registered images along with layers and sources, so this runs again — and is
 * safe to, via the `hasImage` guard — every time the layers are installed.
 */
export async function loadMapIcons(m: maplibregl.Map): Promise<void> {
  const jobs: Promise<void>[] = [];
  const add = (id: string, body: string) => {
    if (m.hasImage(id)) return;
    jobs.push(
      rasterize(svgMarkup(body), RASTER_SIZE).then(image => {
        if (!m.hasImage(id)) m.addImage(id, image, { sdf: true });
      })
    );
  };

  for (const group of Object.keys(SILHOUETTES) as AircraftGroup[]) {
    add(AIRCRAFT_ICON_ID[group], SILHOUETTES[group]);
  }
  add(AIRPORT_ICON_ID, AIRPORT_GLYPH);

  await Promise.all(jobs);
}
