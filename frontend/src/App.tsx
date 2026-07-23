import { useEffect, useState } from 'react';
import MeriApp from './modes/meri/MeriApp';
import { VersionBadge } from './shared/components/VersionBadge';

export type ModeId = 'meri' | 'raide' | 'tie';

// The traffic modes of the consolidated Fintraffic app. Raide and tie flip to
// enabled as their apps (railway, tieliikenne) are ported in.
const MODES: { id: ModeId; label: string; enabled: boolean }[] = [
  { id: 'meri', label: 'Meri', enabled: true },
  { id: 'raide', label: 'Raide', enabled: false },
  { id: 'tie', label: 'Tie', enabled: false },
];

function App() {
  const [mode, setMode] = useState<ModeId>(() => {
    const saved = localStorage.getItem('fintraffic-mode') as ModeId | null;
    return MODES.find((m) => m.id === saved && m.enabled) ? (saved as ModeId) : 'meri';
  });

  useEffect(() => {
    localStorage.setItem('fintraffic-mode', mode);
  }, [mode]);

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

      {mode === 'meri' && <MeriApp />}

      <VersionBadge />
    </>
  );
}

export default App;
