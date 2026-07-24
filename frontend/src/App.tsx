import { useCallback, useEffect, useState } from 'react';
import MeriApp from './modes/meri/MeriApp';
import RaideApp from './modes/raide/RaideApp';
import TieApp from './modes/tie/TieApp';
import { VersionBadge } from './shared/components/VersionBadge';

export type ModeId = 'meri' | 'raide' | 'tie';
export type Theme = 'dark' | 'light';

// The traffic modes of the consolidated Fintraffic app.
const MODES: { id: ModeId; label: string; enabled: boolean }[] = [
  { id: 'meri', label: 'Meri', enabled: true },
  { id: 'raide', label: 'Raide', enabled: true },
  { id: 'tie', label: 'Tie', enabled: true },
];

function App() {
  const [mode, setMode] = useState<ModeId>(() => {
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
      <nav className="mode-switcher" aria-label="Traffic mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-switcher__btn${mode === m.id ? ' mode-switcher__btn--active' : ''}`}
            disabled={!m.enabled}
            title={m.enabled ? m.label : `${m.label} — tulossa`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {mode === 'meri' && <MeriApp theme={theme} setTheme={setTheme} />}
      {mode === 'raide' && <RaideApp theme={theme} onToggleTheme={toggleTheme} />}
      {mode === 'tie' && <TieApp theme={theme} onToggleTheme={toggleTheme} />}

      <VersionBadge />
    </>
  );
}

export default App;
