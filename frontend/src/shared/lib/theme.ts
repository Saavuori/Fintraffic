// The app-wide colour scheme. The shell owns the toggle and persistence and
// passes it down to the active mode; each mode's lib/theme.ts maps it to that
// mode's map colours.
export type Theme = 'dark' | 'light';
