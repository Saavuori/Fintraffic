import type maplibregl from 'maplibre-gl';
import type { TrainGroup } from './trains';

// Pictograms for the map's symbol layers. Path data is lifted from
// lucide-react (ISC license, already a dependency — see FilterPanel.tsx for
// the same icon set used in the panels) so the map's glyphs match the rest of
// the UI instead of introducing a second icon language.
type IconNode = [tag: string, attrs: Record<string, string | number>];

const TRAIN_ICON_NODES: Record<TrainGroup, IconNode[]> = {
  // train-front
  longDistance: [
    ['path', { d: 'M8 3.1V7a4 4 0 0 0 8 0V3.1' }],
    ['path', { d: 'm9 15-1-1' }],
    ['path', { d: 'm15 15 1-1' }],
    ['path', { d: 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z' }],
    ['path', { d: 'm8 19-2 3' }],
    ['path', { d: 'm16 19 2 3' }],
  ],
  // tram-front
  commuter: [
    ['rect', { width: 16, height: 16, x: 4, y: 3, rx: 2 }],
    ['path', { d: 'M4 11h16' }],
    ['path', { d: 'M12 3v8' }],
    ['path', { d: 'm8 19-2 3' }],
    ['path', { d: 'm18 22-2-3' }],
    ['path', { d: 'M8 15h.01' }],
    ['path', { d: 'M16 15h.01' }],
  ],
  // container
  cargo: [
    [
      'path',
      {
        d: 'M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z',
      },
    ],
    ['path', { d: 'M10 21.9V14L2.1 9.1' }],
    ['path', { d: 'm10 14 11.9-6.9' }],
    ['path', { d: 'M14 19.8v-8.1' }],
    ['path', { d: 'M18 17.5V9.4' }],
  ],
  // wrench
  other: [
    [
      'path',
      {
        d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
      },
    ],
  ],
};

// map-pin
const STATION_PIN_NODES: IconNode[] = [
  [
    'path',
    {
      d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    },
  ],
  ['circle', { cx: 12, cy: 10, r: 3 }],
];

export const TRAIN_ICON_ID: Record<TrainGroup, string> = {
  longDistance: 'train-icon-longDistance',
  commuter: 'train-icon-commuter',
  cargo: 'train-icon-cargo',
  other: 'train-icon-other',
};

export const STATION_PIN_ICON_ID = 'station-icon-major';
export const CANCELLED_BADGE_ICON_ID = 'train-icon-cancelled-badge';

const RASTER_SIZE = 64;

function svgMarkup(nodes: IconNode[], extra = ''): string {
  const body = nodes
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr} />`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${extra}${body}</svg>`
  );
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
 * Registers every map pictogram as an SDF image (so `icon-color`/`icon-halo-color`
 * paint can tint it per theme) plus the one fixed-color cancelled badge.
 * `setStyle()` drops registered images along with layers/sources, so this must
 * be re-run — and is safe to re-run, via the `hasImage` guard — every time
 * `installLayers` fires, including after a theme swap.
 */
export async function loadMapIcons(m: maplibregl.Map): Promise<void> {
  const jobs: Promise<void>[] = [];

  for (const group of Object.keys(TRAIN_ICON_NODES) as TrainGroup[]) {
    const id = TRAIN_ICON_ID[group];
    if (m.hasImage(id)) continue;
    jobs.push(
      rasterize(svgMarkup(TRAIN_ICON_NODES[group]), RASTER_SIZE).then(image => {
        if (!m.hasImage(id)) m.addImage(id, image, { sdf: true });
      })
    );
  }

  if (!m.hasImage(STATION_PIN_ICON_ID)) {
    jobs.push(
      rasterize(svgMarkup(STATION_PIN_NODES), RASTER_SIZE).then(image => {
        if (!m.hasImage(STATION_PIN_ICON_ID)) m.addImage(STATION_PIN_ICON_ID, image, { sdf: true });
      })
    );
  }

  if (!m.hasImage(CANCELLED_BADGE_ICON_ID)) {
    // Fixed red/white regardless of theme, so this one isn't an SDF image.
    const badge =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="10" fill="#e63946" stroke="#ffffff" stroke-width="1.5" />` +
      `<path d="M8.5 8.5l7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />` +
      `<path d="M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />` +
      `</svg>`;
    jobs.push(
      rasterize(badge, 32).then(image => {
        if (!m.hasImage(CANCELLED_BADGE_ICON_ID)) m.addImage(CANCELLED_BADGE_ICON_ID, image);
      })
    );
  }

  await Promise.all(jobs);
}
