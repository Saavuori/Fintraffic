import { useCallback, useEffect, useMemo, useState } from 'react';
import Map from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { DetailPanel } from './components/DetailPanel';
import { SelectedCard } from './components/SelectedCard';
import { useIsMobile, MOBILE_QUERY } from '../../shared/hooks/useMediaQuery';
import { useSheetView } from '../../shared/hooks/useSheetView';
import { type Theme } from './lib/theme';
import {
  type Train,
  type StationMeta,
  type Board,
  type TrainGroup,
  trainGroup,
  trainTitle,
} from './lib/trains';
import { type LayerKey, type LayerVisibility, DEFAULT_LAYER_VISIBILITY } from './lib/layers';
import './raide.css';

const trainKey = (t: Pick<Train, 'trainNumber' | 'departureDate'>) =>
  `${t.trainNumber}/${t.departureDate}`;

const EMPTY_COUNTS: Record<TrainGroup, number> = {
  longDistance: 0,
  commuter: 0,
  cargo: 0,
  other: 0,
};

interface RaideAppProps {
  theme: Theme;
  onToggleTheme: () => void;
}

function RaideApp({ theme, onToggleTheme }: RaideAppProps) {
  const isMobile = useIsMobile();
  const [trains, setTrains] = useState<Train[]>([]);
  // Kept here rather than only in the map, so search can reach them.
  const [stations, setStations] = useState<StationMeta[]>([]);
  const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationMeta | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);

  // Panel collapse state — the left filter starts folded on phones.
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  // Viewport centre for the "nearest trains" list, on the mobile sheet and in
  // the desktop rail alike.
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number } | null>(null);
  const handleMoveEnd = useCallback((center: { lng: number; lat: number }) => {
    setMapCenter(center);
  }, []);

  // Keep the open train card in step with the map's 10-second position poll.
  const onTrainsUpdate = useCallback((next: Train[]) => {
    setTrains(next);
    setSelectedTrain(prev => {
      if (!prev) return prev;
      // A train that stopped reporting keeps its last known card rather than
      // going blank mid-read.
      return next.find(t => trainKey(t) === trainKey(prev)) ?? prev;
    });
  }, []);

  // Departure board for the selected station, refreshed while it stays open.
  // The selection callbacks reset the board, so this effect only fetches.
  useEffect(() => {
    if (!selectedStation) return;
    let cancelled = false;
    const load = () => {
      fetch(`/api/raide/departures/${selectedStation.code}`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!cancelled && data) setBoard(data as Board);
        })
        .catch(() => {
          /* transient — the next refresh will retry */
        });
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedStation]);

  const counts = useMemo(() => {
    const c: Record<TrainGroup, number> = { ...EMPTY_COUNTS };
    for (const t of trains) c[trainGroup(t.category)] += 1;
    return c;
  }, [trains]);

  const toggleLayer = useCallback(
    (key: LayerKey) => setLayerVisibility(prev => ({ ...prev, [key]: !prev[key] })),
    []
  );

  // Selecting a train/station opens the detail panel and, on phones, folds the
  // filter panel away so the map stays readable.
  const revealDetail = useCallback(() => {
    setIsDetailCollapsed(false);
    if (window.matchMedia(MOBILE_QUERY).matches) setIsFilterCollapsed(true);
  }, []);

  const selectTrain = useCallback(
    (train: Train) => {
      setSelectedStation(null);
      setBoard(null);
      setSelectedTrain(train);
      revealDetail();
    },
    [revealDetail]
  );

  const selectStation = useCallback(
    (station: StationMeta) => {
      setSelectedTrain(null);
      setBoard(null);
      setSelectedStation(station);
      revealDetail();
    },
    [revealDetail]
  );

  const clearSelection = useCallback(() => {
    setSelectedTrain(null);
    setSelectedStation(null);
    setBoard(null);
  }, []);

  const hasSelection = selectedTrain !== null || selectedStation !== null;

  // The phone's one sheet shows either the selection or the filters (see
  // useSheetView); on desktop both rails are up as before.
  const selectionKey = selectedTrain
    ? `train:${selectedTrain.trainNumber}/${selectedTrain.departureDate}`
    : selectedStation
      ? `station:${selectedStation.code}`
      : null;
  const selectionLabel = selectedTrain
    ? trainTitle(selectedTrain)
    : selectedStation?.name ?? '';
  const sheet = useSheetView(isMobile, selectionKey);

  return (
    <div className="dashboard-container mode-raide">
      <Map
        onSelectTrain={selectTrain}
        onSelectStation={selectStation}
        onTrainsUpdate={onTrainsUpdate}
        onStationsUpdate={setStations}
        visibility={layerVisibility}
        theme={theme}
        onMoveEnd={handleMoveEnd}
      />

      <FilterPanel
        /* The filters and the selection take turns in the phone's one sheet:
           the detail header's filters button swaps to this, the row at the top
           of it swaps back. Desktop shows both rails at once as before. */
        open={sheet.browseOpen}
        selectionLabel={hasSelection ? selectionLabel : null}
        onBackToSelection={sheet.showDetail}
        total={trains.length}
        counts={counts}
        trains={trains}
        onSelectTrain={selectTrain}
        stations={stations}
        onSelectStation={selectStation}
        mapCenter={mapCenter}
        visibility={layerVisibility}
        onToggleLayer={toggleLayer}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isCollapsed={isFilterCollapsed}
        onToggleCollapse={() => setIsFilterCollapsed(v => !v)}
        isMobile={isMobile}
      />

      {hasSelection && (
        <SelectedCard
          train={selectedTrain}
          station={selectedStation}
          theme={theme}
          onClose={clearSelection}
        />
      )}

      {hasSelection && (
        <DetailPanel
          train={selectedTrain}
          station={selectedStation}
          board={board}
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

export default RaideApp;
