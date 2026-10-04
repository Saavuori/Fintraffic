// Theme identity shared by the CSS variables (via the data-theme attribute the
// app shell sets on <html>), the MapLibre basemap, and every color helper in
// lib/. The shell owns the toggle and persistence; this module only maps the
// theme to ilma's map colors.

export type Theme = 'dark' | 'light';

export const BASEMAP_STYLES: Record<Theme, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

/**
 * Halo drawn around the aircraft silhouettes and labels. A silhouette has no
 * puck behind it, so the halo is what keeps it legible over coastlines and
 * place names.
 */
export const MARKER_HALO: Record<Theme, string> = {
  dark: '#05080d',
  light: '#ffffff',
};

/** Ring around the selected aircraft: the mode's own accent. */
export const SELECTION_COLORS: Record<Theme, string> = {
  dark: '#fb923c',
  light: '#c2410c',
};
