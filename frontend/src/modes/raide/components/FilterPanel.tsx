import React from 'react';
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
  X,
} from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BackToSelection } from '../../../shared/components/SheetViewSwitch';
import { TrainSearch } from './TrainSearch';
import {
  type Train,
  type TrainGroup,
  type StationMeta,
  groupColors,
  CATEGORY_LABELS,
} from '../lib/trains';
import { type LayerKey, type LayerVisibility } from '../lib/layers';
import type { Theme } from '../lib/theme';

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
  /** False while a detail page is up on mobile — see Panel's `open`. */
  open?: boolean;
  /**
   * True wherever this panel renders as a rail — desktop, and a phone held
   * sideways. The phone's upright layout keeps search and the type filter on the
   * map instead (a floating pill and the filter strip), so the rail-only blocks
   * are the ones that would otherwise be duplicated.
   */
  asRail: boolean;
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
  asRail,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const colors = groupColors(theme);
  const anyHidden = GROUP_ORDER.some(g => !visibility[g]);

  // On a phone the header button is the way out of a full-screen page: back to
  // the selection it is covering if there is one (the map still has it), and
  // otherwise back to the map, where the launcher takes its place.
  const closePanel = () => {
    // Back to whatever the page is covering: the selection if there is one, and
    // the map either way — a collapsed filter panel is the launcher on it.
    if (isMobile && selectionLabel && onBackToSelection) onBackToSelection();
    onToggleCollapse();
  };

  return (
    <Panel
      variant="filter"
      isMobile={isMobile}
      open={open}
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
              closePanel();
            }}
            aria-label={isMobile ? 'Close filters panel' : 'Collapse filters panel'}
          >
            {isMobile ? <X size={18} /> : <ChevronLeft size={16} />}
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

          {/* Desktop keeps search inside the rail. On a phone held upright it is a
              floating pill over the map (rendered by RaideApp) — the map is what
              you are searching, so the box belongs on it; held sideways the panel
              is a rail again and takes the box back. */}
          {asRail && (
            <TrainSearch
              trains={trains}
              stations={stations}
              onSelectTrain={onSelectTrain}
              onSelectStation={onSelectStation}
              mapCenter={mapCenter}
              theme={theme}
            />
          )}

          <div className="filter-scroll-area">
            {/* The nearest trains are what the search box offers before anything
                is typed (TrainSearch) — the same list, at the point where you are
                asking the question rather than a section you scroll to. */}
            {/* On a phone the types are the filter strip on the map, where you
                can see what switching one off actually did. */}
            {asRail && (
              <>
                <div className="filter-section-title">Train types</div>
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
              </>
            )}

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
    </Panel>
  );
};
