import React from 'react';
import { Plane, TowerControl, Tag, Moon, Sun, ChevronLeft, X } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BackToSelection } from '../../../shared/components/SheetViewSwitch';
import { CategorySwatch } from '../../../shared/components/CategorySwatch';
import { AircraftSearch } from './AircraftSearch';
import {
  type Aircraft,
  type AircraftGroup,
  type Airport,
  ALTITUDE_STOPS,
  GROUP_LABELS,
  GROUP_ORDER,
  groupColors,
} from '../lib/aircraft';
import { GROUP_ICONS } from '../lib/groupIcons';
import { type LayerKey, type LayerVisibility } from '../lib/layers';
import type { Theme } from '../lib/theme';

interface FilterPanelProps {
  total: number;
  counts: Record<AircraftGroup, number>;
  aircraft: Aircraft[];
  onSelectAircraft: (aircraft: Aircraft) => void;
  airports: Airport[];
  onSelectAirport: (airport: Airport) => void;
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
   * sideways. Upright on a phone, search and the type filter live on the map
   * instead (the floating pill and the filter strip).
   */
  asRail: boolean;
}

/** The trail's altitude ramp as a CSS gradient, for the legend. */
const RAMP_GRADIENT = `linear-gradient(90deg, ${ALTITUDE_STOPS.map(
  ([ft, color]) => `${color} ${(ft / ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1][0]) * 100}%`
).join(', ')})`;

export const FilterPanel: React.FC<FilterPanelProps> = ({
  total,
  counts,
  aircraft,
  onSelectAircraft,
  airports,
  onSelectAirport,
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
  // the selection it is covering if there is one, and the map either way.
  const closePanel = () => {
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
          <Plane size={16} />
          <span>Ilmaliikenne</span>
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
          {isMobile && selectionLabel && onBackToSelection && (
            <BackToSelection label={selectionLabel} onClick={onBackToSelection} />
          )}

          <div className="panel-stats">
            <span className="conn-dot" title="Live · updates every 10 s" />
            <span>{total} aircraft</span>
            {anyHidden && (
              <button
                className="clear-filters-btn"
                onClick={() => GROUP_ORDER.forEach(g => visibility[g] || onToggleLayer(g))}
              >
                Show all
              </button>
            )}
          </div>

          {asRail && (
            <AircraftSearch
              aircraft={aircraft}
              airports={airports}
              onSelectAircraft={onSelectAircraft}
              onSelectAirport={onSelectAirport}
              mapCenter={mapCenter}
              theme={theme}
            />
          )}

          <div className="filter-scroll-area">
            {asRail && (
              <>
                <div className="filter-section-title">Aircraft</div>
                <div className="category-list">
                  {GROUP_ORDER.map(group => {
                    const active = visibility[group];
                    return (
                      <button
                        key={group}
                        className={`category-row ${active ? '' : 'inactive'}`}
                        onClick={() => onToggleLayer(group)}
                        aria-pressed={active}
                      >
                        <CategorySwatch color={colors[group]} icon={GROUP_ICONS[group]} />
                        <span className="category-label">{GROUP_LABELS[group]}</span>
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
                className={`layer-toggle ${visibility.airports ? 'on' : ''}`}
                onClick={() => onToggleLayer('airports')}
              >
                <TowerControl size={14} />
                <span>Airports</span>
              </button>
              <button
                className={`layer-toggle ${visibility.labels ? 'on' : ''}`}
                onClick={() => onToggleLayer('labels')}
              >
                <Tag size={14} />
                <span>Callsigns</span>
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

            <div className="altitude-legend" aria-label="Trail colour by altitude">
              <span className="altitude-legend__ramp" style={{ background: RAMP_GRADIENT }} />
              <span className="altitude-legend__scale">
                <span>0 ft</span>
                <span>20 000</span>
                <span>40 000</span>
              </span>
            </div>

            <div className="legend-hint">
              A selected aircraft draws its last 30 min, coloured by altitude. Red ring:
              emergency squawk · faded: on the ground. Positions from volunteer ADS-B
              receivers, so low-level coverage has gaps.
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
};
