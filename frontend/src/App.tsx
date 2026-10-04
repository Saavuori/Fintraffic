import { useCallback, useEffect, useState, type ReactNode } from 'react';
import MeriApp from './modes/meri/MeriApp';
import RaideApp from './modes/raide/RaideApp';
import TieApp from './modes/tie/TieApp';
import IlmaApp from './modes/ilma/IlmaApp';
import { VersionBadge } from './shared/components/VersionBadge';
import { initialLinkedVessel } from './modes/meri/lib/vesselLink';

export type ModeId = 'meri' | 'raide' | 'tie' | 'ilma';
export type Theme = 'dark' | 'light';

// The traffic modes of the consolidated Fintraffic app.
const MODES: { id: ModeId; label: string; enabled: boolean }[] = [
  { id: 'meri', label: 'Meri', enabled: true },
  { id: 'raide', label: 'Raide', enabled: true },
  { id: 'tie', label: 'Tie', enabled: true },
  { id: 'ilma', label: 'Ilma', enabled: true },
];

// Per-mode glyphs for the mobile tab bar. Hidden on desktop (the switcher stays
// a text pill there), shown stacked above the label on phones. Stroked, 24-grid,
// currentColor so they inherit the active/idle tab colour.
const MODE_ICONS: Record<ModeId, ReactNode> = {
  meri: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 10l8-6 8 6M6 12V9m12 3V9" />
    </svg>
  ),
  raide: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 10h12M9 21l-2-3M15 21l2-3M9.5 14h.01M14.5 14h.01" />
    </svg>
  ),
  tie: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21 9 3M18 21 15 3M12 6v2m0 4v2m0 4v2" />
    </svg>
  ),
  ilma: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  ),
};

function App() {
  const [mode, setMode] = useState<ModeId>(() => {
    // A shared vessel link (?vessel=<MMSI>) opens Meri whatever was last used.
    if (initialLinkedVessel() !== null) return 'meri';
    const saved = localStorage.getItem('fintraffic-mode') as ModeId | null;
    return MODES.find((m) => m.id === saved && m.enabled) ? (saved as ModeId) : 'meri';
  });

  useEffect(() => {
    localStorage.setItem('fintraffic-mode', mode);
  }, [mode]);

  // Theme is shell-owned so every mode shares one toggle and one preference.
  // The CSS tokens and each mode's basemap key off the data-theme attribute.
  const [theme, setTheme] = useState<Theme>(() => {
    const saved =
      localStorage.getItem('fintraffic-theme') ?? localStorage.getItem('mapTheme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('fintraffic-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  );

  return (
    <>
      {/* Desktop: a top-left text pill. Mobile: a fixed bottom tab bar in the
          thumb zone (see index.css). data-mode drives the active tab's accent to
          the current mode's colour, since this nav sits outside the mode roots. */}
      <nav className="mode-switcher" aria-label="Traffic mode" data-mode={mode}>
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-switcher__btn${mode === m.id ? ' mode-switcher__btn--active' : ''}`}
            disabled={!m.enabled}
            title={m.enabled ? m.label : `${m.label} — tulossa`}
            aria-current={mode === m.id ? 'page' : undefined}
            onClick={() => setMode(m.id)}
          >
            <span className="mode-switcher__icon">{MODE_ICONS[m.id]}</span>
            <span className="mode-switcher__label">{m.label}</span>
          </button>
        ))}
      </nav>

      {mode === 'meri' && <MeriApp theme={theme} setTheme={setTheme} />}
      {mode === 'raide' && <RaideApp theme={theme} onToggleTheme={toggleTheme} />}
      {mode === 'tie' && <TieApp theme={theme} onToggleTheme={toggleTheme} />}
      {mode === 'ilma' && <IlmaApp theme={theme} onToggleTheme={toggleTheme} />}

      <VersionBadge />
    </>
  );
}

export default App;
