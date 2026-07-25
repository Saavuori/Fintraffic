import React from 'react';
import {
  CarFront,
  Gauge,
  Construction,
  TriangleAlert,
  Signpost,
  SquareParking,
  Camera,
  Zap,
  Moon,
  Sun,
  ChevronLeft,
  X,
} from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BackToSelection } from '../../../shared/components/SheetViewSwitch';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import { type LayerKey, type LayerVisibility, LAYER_ORDER, LAYER_LABELS } from '../lib/layers';
import type { Theme } from '../lib/theme';

interface FilterPanelProps {
  /** Everything searchable the map has fetched, flattened by TieApp. */
  searchItems: SearchItem[];
  onPickSearchResult: (id: string) => void;
  /** What is selected behind this sheet on a phone, if anything. */
  selectionLabel?: string | null;
  onBackToSelection?: () => void;
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

// Pictogram per layer, mirroring what the map draws so the toggle key matches
// the marker.
const LAYER_ICONS: Record<LayerKey, React.ComponentType<{ size?: number }>> = {
  stations: Gauge,
  roadworks: Construction,
  incidents: TriangleAlert,
  speedlimits: Signpost,
  parking: SquareParking,
  weathercams: Camera,
  charging: Zap,
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
  searchItems,
  onPickSearchResult,
  selectionLabel,
  onBackToSelection,
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
      ariaLabel="Open layers panel"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="panel-header" onClick={bodyCollapsed ? undefined : stopPanelClick}>
        <div className="panel-title">
          <CarFront size={16} />
          <span>Tieliikenne</span>
        </div>
        {!bodyCollapsed && (
          <button
            className="icon-btn"
            onClick={e => {
              e.stopPropagation();
              closePanel();
            }}
            aria-label={isMobile ? 'Close layers panel' : 'Collapse layers panel'}
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
            <span className="conn-dot" title="Live · Digitraffic" />
            <span>Live · Digitraffic</span>
          </div>

          {/* Desktop keeps search inside the rail. On a phone held upright it is
              a floating pill over the map (rendered by TieApp) — the map is what
              you are searching; held sideways the panel is a rail again and takes
              the box back. */}
          {asRail && (
            <EntitySearch
              items={searchItems}
              onPick={onPickSearchResult}
              placeholder="Search stations, cameras, parking"
              ariaLabel="Search measurement stations, weather cameras and car parks"
              emptyText="Nothing on the map matches."
            />
          )}

          <div className="filter-scroll-area">
            {/* On a phone the layers are the filter strip on the map, where you
                can see what switching one off actually did. */}
            {asRail && (
              <>
                <div className="filter-section-title">Map layers</div>
                <div className="layer-toggles">
                  {LAYER_ORDER.map(key => {
                    const Icon = LAYER_ICONS[key];
                    return (
                      <button
                        key={key}
                        className={`layer-toggle ${visibility[key] ? 'on' : ''}`}
                        onClick={() => onToggleLayer(key)}
                        aria-pressed={visibility[key]}
                      >
                        <Icon size={14} />
                        <span>{LAYER_LABELS[key]}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="filter-section-title" style={{ marginTop: 14 }}>Appearance</div>
            <div className="layer-toggles" style={{ gridTemplateColumns: '1fr 1fr' }}>
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

          </div>
        </div>
      )}
    </Panel>
  );
};
