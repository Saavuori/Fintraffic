import { useCallback, useMemo, useState } from 'react';
import Map, { type FocusRequest } from './components/Map';
import { INITIAL_CENTER } from './lib/mapView';
import { FilterPanel } from './components/FilterPanel';
import { AircraftSearch } from './components/AircraftSearch';
import { FilterStrip, type FilterChip } from '../../shared/components/FilterStrip';
import { DetailPanel } from './components/DetailPanel';
import { SelectedCard } from './components/SelectedCard';
import {
  useIsMobile,
  useMediaQuery,
  MOBILE_QUERY,
  SHORT_LANDSCAPE_QUERY,
} from '../../shared/hooks/useMediaQuery';
import { useSheetView } from '../../shared/hooks/useSheetView';
import { type Theme } from './lib/theme';
import {
  type Aircraft,
  type AircraftGroup,
  type Airport,
  GROUP_LABELS,
  GROUP_ORDER,
  aircraftTitle,
  groupColors,
} from './lib/aircraft';
import { GROUP_ICONS } from './lib/groupIcons';
import { type LayerKey, type LayerVisibility, DEFAULT_LAYER_VISIBILITY } from './lib/layers';
import './ilma.css';

const EMPTY_COUNTS: Record<AircraftGroup, number> = {
  airline: 0,
  general: 0,
  rotorcraft: 0,
  military: 0,
};

interface IlmaAppProps {
  theme: Theme;
  onToggleTheme: () => void;
}

function IlmaApp({ theme, onToggleTheme }: IlmaAppProps) {
  const isMobile = useIsMobile();
  // Sideways the panels are rails again (see Panel), and the floating search
  // pill would sit on top of them.
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);

  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  // Seeded with the map's opening view, so search offers the nearest aircraft
  // the first time it is tapped.
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number } | null>({
    lng: INITIAL_CENTER[0],
    lat: INITIAL_CENTER[1],
  });
  const handleMoveEnd = useCallback((center: { lng: number; lat: number }) => {
    setMapCenter(center);
  }, []);

  // Keep the open card in step with the 10-second poll. An aircraft the
  // receivers lost keeps its last known card rather than going blank mid-read.
  const onAircraftUpdate = useCallback((next: Aircraft[]) => {
    setAircraft(next);
    setSelectedAircraft(prev => (prev ? next.find(a => a.hex === prev.hex) ?? prev : prev));
  }, []);

  const counts = useMemo(() => {
    const c: Record<AircraftGroup, number> = { ...EMPTY_COUNTS };
    for (const a of aircraft) c[a.group] += 1;
    return c;
  }, [aircraft]);

  const toggleLayer = useCallback(
    (key: LayerKey) => setLayerVisibility(prev => ({ ...prev, [key]: !prev[key] })),
    []
  );

  // Selecting opens the detail panel and, on phones, folds the filter panel
  // away so the map stays readable.
  const revealDetail = useCallback(() => {
    setIsDetailCollapsed(false);
    if (window.matchMedia(MOBILE_QUERY).matches) setIsFilterCollapsed(true);
  }, []);

  const selectAircraft = useCallback(
    (a: Aircraft) => {
      setSelectedAirport(null);
      setSelectedAircraft(a);
      revealDetail();
    },
    [revealDetail]
  );

  const selectAirport = useCallback(
    (ap: Airport) => {
      setSelectedAircraft(null);
      setSelectedAirport(ap);
      revealDetail();
    },
    [revealDetail]
  );

  // Search picks can be anywhere in the country, so they also bring the map
  // there; map clicks already have the thing under the pointer.
  const searchAircraft = useCallback(
    (a: Aircraft) => {
      selectAircraft(a);
      setFocus(prev => ({ lng: a.longitude, lat: a.latitude, seq: (prev?.seq ?? 0) + 1 }));
    },
    [selectAircraft]
  );

  const searchAirport = useCallback(
    (ap: Airport) => {
      selectAirport(ap);
      setFocus(prev => ({ lng: ap.longitude, lat: ap.latitude, seq: (prev?.seq ?? 0) + 1 }));
    },
    [selectAirport]
  );

  const clearSelection = useCallback(() => {
    setSelectedAircraft(null);
    setSelectedAirport(null);
  }, []);

  const hasSelection = selectedAircraft !== null || selectedAirport !== null;
  const selectionKey = selectedAircraft
    ? `aircraft:${selectedAircraft.hex}`
    : selectedAirport
      ? `airport:${selectedAirport.icao}`
      : null;
  const selectionLabel = selectedAircraft
    ? aircraftTitle(selectedAircraft)
    : selectedAirport?.name ?? '';
  const sheet = useSheetView(isMobile, selectionKey);

  const pageUp =
    (hasSelection && sheet.detailOpen) || (sheet.browseOpen && !isFilterCollapsed);
  const searchOnMap = isMobile && !shortLandscape;
  const onMap = searchOnMap && !pageUp;

  const typeChips = useMemo<FilterChip[]>(() => {
    const colors = groupColors(theme);
    return GROUP_ORDER.map(group => ({
      id: group,
      label: GROUP_LABELS[group],
      color: colors[group],
      icon: GROUP_ICONS[group],
      count: counts[group] ?? 0,
      active: layerVisibility[group],
    }));
  }, [counts, layerVisibility, theme]);

  const showAllGroups = useCallback(
    () =>
      setLayerVisibility(prev => ({
        ...prev,
        airline: true,
        general: true,
        rotorcraft: true,
        military: true,
      })),
    []
  );

  return (
    <div className="dashboard-container mode-ilma">
      <Map
        onSelectAircraft={selectAircraft}
        onSelectAirport={selectAirport}
        onAircraftUpdate={onAircraftUpdate}
        onAirportsUpdate={setAirports}
        selectedHex={selectedAircraft?.hex ?? null}
        focus={focus}
        visibility={layerVisibility}
        theme={theme}
        onMoveEnd={handleMoveEnd}
      />

      {onMap && (
        <AircraftSearch
          aircraft={aircraft}
          airports={airports}
          onSelectAircraft={searchAircraft}
          onSelectAirport={searchAirport}
          mapCenter={mapCenter}
          theme={theme}
          variant="floating"
        />
      )}

      {onMap && (
        <FilterStrip
          chips={typeChips}
          onToggle={id => toggleLayer(id as LayerKey)}
          onShowAll={showAllGroups}
          ariaLabel="Aircraft kinds"
        />
      )}

      <FilterPanel
        open={sheet.browseOpen}
        selectionLabel={hasSelection ? selectionLabel : null}
        onBackToSelection={sheet.showDetail}
        total={aircraft.length}
        counts={counts}
        aircraft={aircraft}
        onSelectAircraft={searchAircraft}
        airports={airports}
        onSelectAirport={searchAirport}
        mapCenter={mapCenter}
        visibility={layerVisibility}
        onToggleLayer={toggleLayer}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isCollapsed={isFilterCollapsed}
        onToggleCollapse={() => setIsFilterCollapsed(v => !v)}
        isMobile={isMobile}
        asRail={!searchOnMap}
      />

      {hasSelection && (
        <SelectedCard
          aircraft={selectedAircraft}
          airport={selectedAirport}
          theme={theme}
          onClose={clearSelection}
        />
      )}

      {hasSelection && (
        <DetailPanel
          aircraft={selectedAircraft}
          airport={selectedAirport}
          allAircraft={aircraft}
          onSelectAircraft={searchAircraft}
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

export default IlmaApp;
