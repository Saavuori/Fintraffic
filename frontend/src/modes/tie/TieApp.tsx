import { useCallback, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import Map, { type TieData } from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { DetailPanel, type Selection } from './components/DetailPanel';
import { SelectedCard } from './components/SelectedCard';
import { useIsMobile, MOBILE_QUERY } from '../../shared/hooks/useMediaQuery';
import { useSheetView } from '../../shared/hooks/useSheetView';
import type { SearchItem } from '../../shared/components/EntitySearch';
import { type Theme } from './lib/theme';
import { congestionColors, directionalStatuses, type Station } from './lib/traffic';
import { parkingColors, parkingLevel, type ParkingFacility } from './lib/parking';
import { weathercamColor, type WeathercamStation } from './lib/weathercam';
import { chargingColors, chargingLevel, type ChargingStation } from './lib/charging';
import { type LayerKey, type LayerVisibility, DEFAULT_LAYER_VISIBILITY } from './lib/layers';
import './tie.css';

const EMPTY_DATA: TieData = { stations: [], facilities: [], cameras: [], chargers: [] };

interface TieAppProps {
  theme: Theme;
  onToggleTheme: () => void;
}

function TieApp({ theme, onToggleTheme }: TieAppProps) {
  const isMobile = useIsMobile();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  // The map's feeds, mirrored here so search can reach them.
  const [data, setData] = useState<TieData>(EMPTY_DATA);

  const mergeData = useCallback(
    (patch: Partial<TieData>) => setData(prev => ({ ...prev, ...patch })),
    []
  );

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

  // One box over four feeds: measurement stations by name or road, car parks,
  // cameras and chargers. Each row wears the colour its marker has on the map.
  const searchItems = useMemo<SearchItem[]>(() => {
    const congestion = congestionColors(theme);
    const parking = parkingColors(theme);
    const charging = chargingColors(theme);
    const items: SearchItem[] = [];
    for (const s of data.stations) {
      const [dir1] = directionalStatuses(s);
      items.push({
        id: `station:${s.id}`,
        label: s.name,
        meta: 'TMS',
        accent: congestion[dir1.level],
        haystack: `${s.name} ${s.id}`.toLowerCase(),
      });
    }
    for (const f of data.facilities) {
      items.push({
        id: `parking:${f.id}`,
        label: f.name,
        meta: 'Parking',
        accent: parking[parkingLevel(f)],
        haystack: `${f.name}`.toLowerCase(),
      });
    }
    for (const c of data.cameras) {
      items.push({
        id: `camera:${c.id}`,
        label: c.name,
        meta: 'Camera',
        accent: weathercamColor(theme),
        haystack: `${c.name} ${c.id}`.toLowerCase(),
      });
    }
    for (const c of data.chargers) {
      items.push({
        id: `charger:${c.id}`,
        label: c.name,
        meta: 'Charging',
        accent: charging[chargingLevel(c)],
        haystack: `${c.name} ${c.operator ?? ''} ${c.city ?? ''}`.toLowerCase(),
      });
    }
    return items;
  }, [data, theme]);

  const pickSearchResult = useCallback(
    (id: string) => {
      const sep = id.indexOf(':');
      const kind = id.slice(0, sep);
      const key = id.slice(sep + 1);
      if (kind === 'station') {
        const station = data.stations.find(s => String(s.id) === key);
        if (station) onSelectStation(station);
      } else if (kind === 'parking') {
        const facility = data.facilities.find(f => String(f.id) === key);
        if (facility) onSelectFacility(facility);
      } else if (kind === 'camera') {
        const camera = data.cameras.find(c => c.id === key);
        if (camera) onSelectCamera(camera);
      } else if (kind === 'charger') {
        const charger = data.chargers.find(c => c.id === key);
        if (charger) onSelectCharger(charger);
      }
    },
    [data, onSelectStation, onSelectFacility, onSelectCamera, onSelectCharger]
  );

  // The phone's one sheet shows either the selection or the filters.
  const selectionKey = selection
    ? selection.kind === 'station'
      ? `station:${selection.station.id}`
      : selection.kind === 'parking'
        ? `parking:${selection.facility.id}`
        : selection.kind === 'camera'
          ? `camera:${selection.camera.id}`
          : `charger:${selection.charger.id}`
    : null;
  const selectionLabel = selection
    ? selection.kind === 'station'
      ? selection.station.name
      : selection.kind === 'parking'
        ? selection.facility.name
        : selection.kind === 'camera'
          ? selection.camera.name
          : selection.charger.name
    : '';
  const sheet = useSheetView(isMobile, selectionKey);

  return (
    <div className="dashboard-container mode-tie">
      <Map
        onSelectStation={onSelectStation}
        onSelectFacility={onSelectFacility}
        onSelectCamera={onSelectCamera}
        onSelectCharger={onSelectCharger}
        onDataUpdate={mergeData}
        visibility={layerVisibility}
        theme={theme}
      />

      <FilterPanel
        /* The filters and the selection take turns in the phone's one sheet;
           desktop shows both rails at once as before. */
        open={sheet.browseOpen}
        selectionLabel={selection ? selectionLabel : null}
        onBackToSelection={sheet.showDetail}
        searchItems={searchItems}
        onPickSearchResult={pickSearchResult}
        visibility={layerVisibility}
        onToggleLayer={toggleLayer}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isCollapsed={isFilterCollapsed}
        onToggleCollapse={() => setIsFilterCollapsed(v => !v)}
        isMobile={isMobile}
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
          isMobile={isMobile}
          open={sheet.detailOpen}
          onShowBrowse={sheet.showBrowse}
        />
      )}
    </div>
  );
}

export default TieApp;
