import React from 'react';
import { Ship, Anchor, Waves, TriangleAlert, Moon, Sun, ChevronLeft, History, Video, X } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BackToSelection } from '../../../shared/components/SheetViewSwitch';
import { VesselSearch } from './VesselSearch';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, type ShipCategory } from '../lib/shipTypes';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import type { AtonFaultFeature, Vessel } from '../types';

interface FilterPanelProps {
  vessels: Record<string, Vessel>;
  onSelectVessel: (mmsi: number) => void;
  categoryCounts: Record<ShipCategory, number>;
  totalVessels: number;
  selectedCategories: ShipCategory[];
  onToggleCategory: (cat: ShipCategory) => void;
  onClearFilters: () => void;
  connectionStatus: ConnectionStatus;
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
  /** What is selected behind this sheet on a phone, if anything — offers a way back. */
  selectionLabel?: string | null;
  onBackToSelection?: () => void;
  mapCenter: { lng: number; lat: number } | null;
  mapTheme: 'light' | 'dark';
  setMapTheme: (theme: 'light' | 'dark') => void;
  showPorts: boolean;
  setShowPorts: (v: boolean) => void;
  showSeaConditions: boolean;
  setShowSeaConditions: (v: boolean) => void;
  showAton: boolean;
  setShowAton: (v: boolean) => void;
  atonFaults: AtonFaultFeature[];
  showWebcams: boolean;
  setShowWebcams: (v: boolean) => void;
  replayActive: boolean;
  onEnterReplay: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  vessels,
  onSelectVessel,
  categoryCounts,
  totalVessels,
  selectedCategories,
  onToggleCategory,
  onClearFilters,
  connectionStatus,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  open = true,
  asRail,
  selectionLabel,
  onBackToSelection,
  mapCenter,
  mapTheme,
  setMapTheme,
  showPorts,
  setShowPorts,
  showSeaConditions,
  setShowSeaConditions,
  showAton,
  setShowAton,
  atonFaults,
  showWebcams,
  setShowWebcams,
  replayActive,
  onEnterReplay,
}) => {
  // On mobile the sheet body stays mounted (the sheet's translateY hides it at
  // peek); only desktop unmounts the body when collapsed.
  const bodyCollapsed = !isMobile && isCollapsed;

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
          <Ship size={16} />
          <span>Meriliikenne</span>
        </div>
        {!bodyCollapsed && (
          <button
            className="icon-btn"
            onClick={(e) => {
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
          {/* The way back to what is selected. It sits in the peek row so a
              minimized browse sheet still says what it is covering. */}
          {selectionLabel && onBackToSelection && (
            <BackToSelection label={selectionLabel} onClick={onBackToSelection} />
          )}

          <div className="panel-stats">
            <span
              className={`conn-dot ${connectionStatus}`}
              role="status"
              aria-label={`Connection: ${connectionStatus}`}
              title={connectionStatus}
            />
            <span>{totalVessels} vessels</span>
            {selectedCategories.length > 0 && (
              <button className="clear-filters-btn" onClick={onClearFilters}>
                Clear
              </button>
            )}
          </div>

          {/* Desktop keeps search inside the rail. On a phone held upright it
              moves out to a floating pill over the map (rendered by MeriApp) so
              it isn't buried under the sheet's peek; held sideways the panel is
              a rail again and takes the box back. */}
          {asRail && (
            <VesselSearch
              vessels={vessels}
              onSelectVessel={onSelectVessel}
              mapCenter={mapCenter}
            />
          )}

          <div className="filter-scroll-area">
            {/* The nearest vessels are what the search box offers before anything
                is typed (VesselSearch) — the same list, at the point where you
                are asking the question rather than a section you scroll to. */}
            {/* On a phone the categories are the filter strip on the map, where
                you can see what switching one off actually did. */}
            {asRail && (
              <>
                <div className="filter-section-title">Vessel categories</div>
                <div className="category-list">
                  {ALL_CATEGORIES.map((cat) => {
                    const active =
                      selectedCategories.length === 0 || selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        className={`category-row ${active ? '' : 'inactive'}`}
                        onClick={() => onToggleCategory(cat)}
                      >
                        <span
                          className="category-swatch"
                          style={{ background: CATEGORY_COLORS[cat] }}
                        />
                        <span className="category-label">{CATEGORY_LABELS[cat]}</span>
                        <span className="category-count">{categoryCounts[cat] ?? 0}</span>
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
              <button className={`layer-toggle ${showPorts ? 'on' : ''}`} onClick={() => setShowPorts(!showPorts)}>
                <Anchor size={14} />
                <span>Ports</span>
              </button>
              <button
                className={`layer-toggle ${showWebcams ? 'on' : ''}`}
                onClick={() => setShowWebcams(!showWebcams)}
              >
                <Video size={14} />
                <span>Webcams</span>
              </button>
              <button
                className={`layer-toggle ${showSeaConditions ? 'on' : ''}`}
                onClick={() => setShowSeaConditions(!showSeaConditions)}
              >
                <Waves size={14} />
                <span>Sea conditions</span>
              </button>
              <button className={`layer-toggle ${showAton ? 'on' : ''}`} onClick={() => setShowAton(!showAton)}>
                <TriangleAlert size={14} />
                <span>AtoN faults</span>
              </button>
            </div>

            {/* Appearance and replay are settings rather than layers, so on
                desktop they live on the map itself — a theme pill in the top
                corner (as in Tie) and a replay section along the bottom, where
                the transport bar it opens into appears. The phone's sheet has
                no such margins to spare, so it keeps them both in here. */}
            {isMobile && (
              <>
                <div className="filter-section-title" style={{ marginTop: 14 }}>
                  Appearance
                </div>
                <div className="layer-toggles">
                  <button
                    className={`layer-toggle ${mapTheme === 'dark' ? 'on' : ''}`}
                    onClick={() => setMapTheme('dark')}
                    aria-pressed={mapTheme === 'dark'}
                  >
                    <Moon size={14} />
                    <span>Dark</span>
                  </button>
                  <button
                    className={`layer-toggle ${mapTheme === 'light' ? 'on' : ''}`}
                    onClick={() => setMapTheme('light')}
                    aria-pressed={mapTheme === 'light'}
                  >
                    <Sun size={14} />
                    <span>Light</span>
                  </button>
                </div>

                <div className="layer-toggles" style={{ marginTop: 8 }}>
                  <button
                    className={`layer-toggle ${replayActive ? 'on' : ''}`}
                    style={{ gridColumn: '1 / -1' }}
                    onClick={onEnterReplay}
                    title="Replay recorded vessel movement"
                  >
                    <History size={14} />
                    <span>Replay recorded movement</span>
                  </button>
                </div>
              </>
            )}

            {showAton && atonFaults.length > 0 && (
              <>
                <div className="filter-section-title" style={{ marginTop: 14 }}>
                  <TriangleAlert size={12} />
                  Navigation aid faults ({atonFaults.length})
                </div>
                <div className="alerts-list">
                  {atonFaults.slice(0, 30).map((f) => (
                    <div className="alert-item" key={f.properties.id}>
                      <div className="alert-title">{f.properties.aton_name_fi}</div>
                      <div className="alert-desc">
                        {f.properties.type} · {f.properties.fairway_name_fi}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};
