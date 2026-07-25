import React, { useCallback, useMemo, useState } from 'react';
import {
  Moon,
  Sun,
  Gauge,
  Construction,
  TriangleAlert,
  Signpost,
  SquareParking,
  Camera,
  Zap,
} from 'lucide-react';
import Map, { type TieData } from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { DetailPanel, type Selection } from './components/DetailPanel';
import { SelectedCard } from './components/SelectedCard';
import {
  useIsMobile,
  useMediaQuery,
  MOBILE_QUERY,
  SHORT_LANDSCAPE_QUERY,
} from '../../shared/hooks/useMediaQuery';
import { useSheetView } from '../../shared/hooks/useSheetView';
import { EntitySearch, type SearchItem } from '../../shared/components/EntitySearch';
import { FilterStrip, type FilterChip } from '../../shared/components/FilterStrip';
import { type Theme } from './lib/theme';
import { congestionColors, directionalStatuses, type Station } from './lib/traffic';
import { parkingColors, parkingLevel, type ParkingFacility } from './lib/parking';
import { weathercamColor, type WeathercamStation } from './lib/weathercam';
import { chargingColors, chargingLevel, type ChargingStation } from './lib/charging';
import {
  type LayerKey,
  type LayerVisibility,
  DEFAULT_LAYER_VISIBILITY,
  LAYER_ORDER,
  LAYER_LABELS,
} from './lib/layers';
import './tie.css';

const EMPTY_DATA: TieData = { stations: [], facilities: [], cameras: [], chargers: [] };

// Pictogram per layer, mirroring what the map draws — Tie keys its layers by
// shape rather than by one colour each, so the strip does too.
const LAYER_ICONS: Record<LayerKey, React.ComponentType<{ size?: number }>> = {
  stations: Gauge,
  roadworks: Construction,
  incidents: TriangleAlert,
  speedlimits: Signpost,
  parking: SquareParking,
  weathercams: Camera,
  charging: Zap,
};

interface TieAppProps {
  theme: Theme;
  onToggleTheme: () => void;
}

function TieApp({ theme, onToggleTheme }: TieAppProps) {
  const isMobile = useIsMobile();
  // Sideways the panels are rails again (see Panel), and the floating search
  // pill would sit on top of them.
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);
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

  // The pill belongs to the map, so it is only up while the map is: a panel
  // page covers the screen whole, and search goes with what it is covering.
  const pageUp =
    (selection !== null && sheet.detailOpen) || (sheet.browseOpen && !isFilterCollapsed);
  const searchOnMap = isMobile && !shortLandscape;
  const onMap = searchOnMap && !pageUp;

  // The phone's filter rail: the same layers the desktop rail lists, on the map
  // where the effect of switching one off is visible.
  const layerChips = useMemo<FilterChip[]>(
    () =>
      LAYER_ORDER.map(key => ({
        id: key,
        label: LAYER_LABELS[key],
        icon: LAYER_ICONS[key],
        active: layerVisibility[key],
      })),
    [layerVisibility]
  );

  const showAllLayers = useCallback(() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY), []);

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

      {/* On a phone search is a floating pill over the map — the map is what is
          being searched, and the tab bar freed the top of the screen for it.
          Desktop keeps the box inside the filter rail. */}
      {onMap && (
        <EntitySearch
          items={searchItems}
          onPick={pickSearchResult}
          placeholder="Search stations, cameras, parking"
          ariaLabel="Search measurement stations, weather cameras and car parks"
          emptyText="Nothing on the map matches."
          variant="floating"
        />
      )}

      {onMap && (
        <FilterStrip
          chips={layerChips}
          onToggle={id => toggleLayer(id as LayerKey)}
          onShowAll={showAllLayers}
          ariaLabel="Map layers"
        />
      )}

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
        asRail={!searchOnMap}
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
