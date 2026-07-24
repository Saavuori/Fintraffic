import { useCallback, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import Map from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { DetailPanel, type Selection } from './components/DetailPanel';
import { SelectedCard } from './components/SelectedCard';
import { type Theme } from './lib/theme';
import type { Station } from './lib/traffic';
import type { ParkingFacility } from './lib/parking';
import type { WeathercamStation } from './lib/weathercam';
import type { ChargingStation } from './lib/charging';
import { type LayerKey, type LayerVisibility, DEFAULT_LAYER_VISIBILITY } from './lib/layers';
import './tie.css';

const MOBILE_QUERY = '(max-width: 768px)';

interface TieAppProps {
  theme: Theme;
  onToggleTheme: () => void;
}

function TieApp({ theme, onToggleTheme }: TieAppProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);

  // The left filter starts folded on phones so the map is readable; the detail
  // panel is only mounted when something is selected.
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  const toggleLayer = useCallback(
    (key: LayerKey) => setLayerVisibility(prev => ({ ...prev, [key]: !prev[key] })),
    []
  );

  // Selecting a marker opens the detail panel and, on phones, folds the filter
  // panel away so the map stays readable.
  const select = useCallback((next: Selection) => {
    setSelection(next);
    setIsDetailCollapsed(false);
    if (window.matchMedia(MOBILE_QUERY).matches) setIsFilterCollapsed(true);
  }, []);

  const onSelectStation = useCallback(
    (station: Station) => select({ kind: 'station', station }),
    [select]
  );
  const onSelectFacility = useCallback(
    (facility: ParkingFacility) => select({ kind: 'parking', facility }),
    [select]
  );
  const onSelectCamera = useCallback(
    (camera: WeathercamStation) => select({ kind: 'camera', camera }),
    [select]
  );
  const onSelectCharger = useCallback(
    (charger: ChargingStation) => select({ kind: 'charger', charger }),
    [select]
  );

  const clearSelection = useCallback(() => setSelection(null), []);

  return (
    <div className="dashboard-container mode-tie">
      <Map
        onSelectStation={onSelectStation}
        onSelectFacility={onSelectFacility}
        onSelectCamera={onSelectCamera}
        onSelectCharger={onSelectCharger}
        visibility={layerVisibility}
        theme={theme}
      />

      <FilterPanel
        visibility={layerVisibility}
        onToggleLayer={toggleLayer}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isCollapsed={isFilterCollapsed}
        onToggleCollapse={() => setIsFilterCollapsed(v => !v)}
      />

      <button
        className={`theme-toggle ${selection ? 'detail-open' : ''}`}
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {selection && <SelectedCard selection={selection} theme={theme} onClose={clearSelection} />}

      {selection && (
        <DetailPanel
          selection={selection}
          theme={theme}
          onClose={clearSelection}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={() => setIsDetailCollapsed(v => !v)}
        />
      )}
    </div>
  );
}

export default TieApp;
