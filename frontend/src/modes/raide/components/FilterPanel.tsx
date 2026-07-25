import React, { useMemo } from 'react';
import {
  TrainFront,
  TramFront,
  Container,
  Wrench,
  MapPin,
  Route,
  Moon,
  Sun,
  ChevronLeft,
} from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { BackToSelection } from '../../../shared/components/SheetViewSwitch';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import {
  type Train,
  type TrainGroup,
  type StationMeta,
  groupColors,
  trainGroup,
  trainLabel,
  trainTitle,
  STATION_COLORS,
  CATEGORY_LABELS,
} from '../lib/trains';
import { type LayerKey, type LayerVisibility } from '../lib/layers';
import type { Theme } from '../lib/theme';

const NEAREST_COUNT = 5;
const DEG = Math.PI / 180;

/** Trains closest to `center`, each with an equirectangular distance in km. */
function nearestTrains(
  center: { lng: number; lat: number },
  trains: Train[],
  count: number
): Array<{ train: Train; km: number }> {
  return trains
    .filter((t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude))
    .map((train) => {
      const meanLat = ((center.lat + train.latitude) / 2) * DEG;
      const dx = (center.lng - train.longitude) * Math.cos(meanLat);
      const dy = center.lat - train.latitude;
      return { train, km: Math.sqrt(dx * dx + dy * dy) * DEG * 6371 };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

interface FilterPanelProps {
  total: number;
  counts: Record<TrainGroup, number>;
  trains: Train[];
  onSelectTrain: (train: Train) => void;
  /** Every passenger station, for search. */
  stations: StationMeta[];
  onSelectStation: (station: StationMeta) => void;
  /** What is selected behind this sheet on a phone, if anything. */
  selectionLabel?: string | null;
  onBackToSelection?: () => void;
  mapCenter: { lng: number; lat: number } | null;
  visibility: LayerVisibility;
  onToggleLayer: (key: LayerKey) => void;
  theme: Theme;
  onToggleTheme: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  /** False while a detail sheet is up on mobile — see BottomSheet's `open`. */
  open?: boolean;
}

const GROUP_ORDER: TrainGroup[] = ['longDistance', 'commuter', 'cargo', 'other'];

// Pictogram per group, mirroring what the map draws (see lib/mapIcons.ts) so
// the swatch key matches the marker.
const GROUP_ICONS: Record<TrainGroup, React.ComponentType<{ size?: number }>> = {
  longDistance: TrainFront,
  commuter: TramFront,
  cargo: Container,
  other: Wrench,
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
  total,
  counts,
  trains,
  onSelectTrain,
  stations,
  onSelectStation,
  selectionLabel,
  onBackToSelection,
  mapCenter,
  visibility,
  onToggleLayer,
  theme,
  onToggleTheme,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  open = true,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const colors = groupColors(theme);
  const anyHidden = GROUP_ORDER.some(g => !visibility[g]);

  // Trains nearest the viewport centre — the sheet's glanceable content on
  // mobile, the top of the rail on desktop. Computed once the map has reported
  // a centre.
  const nearest = useMemo(() => {
    if (!mapCenter) return [];
    return nearestTrains(mapCenter, trains, NEAREST_COUNT);
  }, [mapCenter, trains]);

  // Trains by number, line or route, and stations by name or code. Both kinds
  // in one box: on a phone this is the only way to reach a named train without
  // panning the map until it appears.
  const searchItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = trains.map(t => ({
      id: `train:${t.trainNumber}/${t.departureDate}`,
      label: trainTitle(t),
      meta: t.dest || undefined,
      accent: colors[trainGroup(t.category)],
      haystack: `${trainLabel(t)} ${t.trainType} ${t.trainNumber} ${t.commuterLine} ${t.origin} ${t.dest}`.toLowerCase(),
    }));
    for (const s of stations) {
      items.push({
        id: `station:${s.code}`,
        label: s.name,
        meta: s.code,
        accent: STATION_COLORS[theme],
        haystack: `${s.name} ${s.code}`.toLowerCase(),
      });
    }
    return items;
  }, [trains, stations, colors, theme]);

  const pickSearchResult = (id: string) => {
    const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (kind === 'train') {
      const train = trains.find(t => `${t.trainNumber}/${t.departureDate}` === key);
      if (train) onSelectTrain(train);
      return;
    }
    const station = stations.find(s => s.code === key);
    if (station) onSelectStation(station);
  };

  return (
    <BottomSheet
      variant="filter"
      isMobile={isMobile}
      open={open}
      className={selectionLabel ? 'has-back' : undefined}
      ariaLabel="Open filters panel"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="panel-header" onClick={bodyCollapsed ? undefined : stopPanelClick}>
        <div className="panel-title">
          <TrainFront size={16} />
          <span>Raideliikenne</span>
        </div>
        {!bodyCollapsed && (
          <button
            className="icon-btn"
            onClick={e => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            aria-label="Collapse filters panel"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {!bodyCollapsed && (
        <div className="filter-content" onClick={stopPanelClick}>
          {selectionLabel && onBackToSelection && (
            <BackToSelection label={selectionLabel} onClick={onBackToSelection} />
          )}

          <div className="panel-stats">
            <span className="conn-dot" title="Live · updates every 10 s" />
            <span>{total} trains</span>
            {anyHidden && (
              <button
                className="clear-filters-btn"
                onClick={() => GROUP_ORDER.forEach(g => visibility[g] || onToggleLayer(g))}
              >
                Show all
              </button>
            )}
          </div>

          <EntitySearch
            items={searchItems}
            onPick={pickSearchResult}
            placeholder="Search trains and stations"
            ariaLabel="Search trains by number or route, stations by name"
            emptyText="No trains or stations match."
          />

          <div className="filter-scroll-area">
            {nearest.length > 0 && (
              <>
                <div className="filter-section-title">Nearest</div>
                <div className="nearest-list">
                  {nearest.map(({ train, km }) => (
                    <button
                      key={`${train.trainNumber}/${train.departureDate}`}
                      className="nearest-row"
                      onClick={() => onSelectTrain(train)}
                    >
                      <span
                        className="nearest-dot"
                        style={{ background: colors[trainGroup(train.category)] }}
                      />
                      <span className="nearest-name">{trainLabel(train)}</span>
                      <span className="nearest-dist">{formatDistanceKm(km)}</span>
                      <span className="nearest-speed">{train.speed} km/h</span>
                    </button>
                  ))}
                </div>
                <div className="filter-section-title" style={{ marginTop: 14 }}>
                  Train types
                </div>
              </>
            )}
            {nearest.length === 0 && <div className="filter-section-title">Train types</div>}
            <div className="category-list">
              {GROUP_ORDER.map(group => {
                const Icon = GROUP_ICONS[group];
                const active = visibility[group];
                return (
                  <button
                    key={group}
                    className={`category-row ${active ? '' : 'inactive'}`}
                    onClick={() => onToggleLayer(group)}
                    aria-pressed={active}
                  >
                    <span className="category-swatch" style={{ background: colors[group] }}>
                      <Icon size={10} />
                    </span>
                    <span className="category-label">{CATEGORY_LABELS[group]}</span>
                    <span className="category-count">{counts[group] ?? 0}</span>
                  </button>
                );
              })}
            </div>

            <div className="filter-section-title" style={{ marginTop: 14 }}>
              Map layers
            </div>
            <div className="layer-toggles">
              <button
                className={`layer-toggle ${visibility.stations ? 'on' : ''}`}
                onClick={() => onToggleLayer('stations')}
              >
                <MapPin size={14} />
                <span>Stations</span>
              </button>
              <button
                className={`layer-toggle ${visibility.tracks ? 'on' : ''}`}
                onClick={() => onToggleLayer('tracks')}
              >
                <Route size={14} />
                <span>Tracks</span>
              </button>
            </div>

            <div className="filter-section-title" style={{ marginTop: 14 }}>
              Appearance
            </div>
            <div className="layer-toggles">
              <button
                className={`layer-toggle ${theme === 'dark' ? 'on' : ''}`}
                onClick={() => { if (theme !== 'dark') onToggleTheme(); }}
                aria-pressed={theme === 'dark'}
              >
                <Moon size={14} />
                <span>Dark</span>
              </button>
              <button
                className={`layer-toggle ${theme === 'light' ? 'on' : ''}`}
                onClick={() => { if (theme !== 'light') onToggleTheme(); }}
                aria-pressed={theme === 'light'}
              >
                <Sun size={14} />
                <span>Light</span>
              </button>
            </div>

            <div className="legend-hint">
              Yellow ring: 3+ min late · red ring: 10+ min. Click a station for its
              departures.
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
