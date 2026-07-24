// Theme identity shared by the CSS variables (via the data-theme attribute the
// app shell sets on <html>), the MapLibre basemap, and every color helper in
// lib/. The shell owns the toggle and persistence; this module only maps the
// theme to tie's map colors.

export type Theme = 'dark' | 'light';

export const BASEMAP_STYLES: Record<Theme, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

/** Outline drawn around map markers so they stay legible against the basemap. */
export const MARKER_STROKE: Record<Theme, string> = {
  dark: '#ffffff',
  light: '#1f2937',
};
