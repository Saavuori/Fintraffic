import React, { useMemo } from 'react';
import { Ship, Anchor, Waves, TriangleAlert, Moon, Sun, ChevronLeft, History, Video } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { VesselSearch } from './VesselSearch';
import { nearestTo, formatDistanceKm } from '../lib/geo';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, categorize, type ShipCategory } from '../lib/shipTypes';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import type { AtonFaultFeature, Vessel } from '../types';

const NEAREST_COUNT = 5;

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
  /** False while a detail sheet is up on mobile — see BottomSheet's `open`. */
  open?: boolean;
  mapCenter: { lng: number; lat: number } | null;
  mapTheme: 'light' | 'dark';
  setMapTheme: (theme: 'light' | 'dark') => void;
  showPorts: boolean;
  setShowPorts: (v: boolean) => void;
  showBuoys: boolean;
  setShowBuoys: (v: boolean) => void;
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
  mapCenter,
  mapTheme,
  setMapTheme,
  showPorts,
  setShowPorts,
  showBuoys,
  setShowBuoys,
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

  // Vessels nearest the viewport centre — the sheet's glanceable content on
  // mobile, the top of the rail on desktop. Computed once the map has reported
  // a centre; vessels without a fix are skipped.
  const nearest = useMemo(() => {
    if (!mapCenter) return [];
    const located = Object.values(vessels).filter(
      (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)
    );
    return nearestTo(mapCenter, located, NEAREST_COUNT);
  }, [mapCenter, vessels]);

  return (
    <BottomSheet
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

          {/* Desktop keeps search inside the rail. On mobile it moves out to a
              floating pill over the map (rendered by MeriApp), so it isn't
              buried under the sheet's peek. */}
          {!isMobile && <VesselSearch vessels={vessels} onSelectVessel={onSelectVessel} />}

          <div className="filter-scroll-area">
            {nearest.length > 0 && (
              <>
                <div className="filter-section-title">Nearest</div>
                <div className="nearest-list">
                  {nearest.map(({ item: v, km }) => (
                    <button
                      key={v.mmsi}
                      className="nearest-row"
                      onClick={() => onSelectVessel(v.mmsi)}
                    >
                      <span
                        className="nearest-dot"
                        style={{ background: CATEGORY_COLORS[categorize(v.shipType)] }}
                      />
                      <span className="nearest-name">{v.name || `MMSI ${v.mmsi}`}</span>
                      <span className="nearest-dist">{formatDistanceKm(km)}</span>
                      <span className="nearest-speed">
                        {Number.isFinite(v.sog) ? `${v.sog!.toFixed(1)} kn` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="filter-section-title" style={{ marginTop: 14 }}>
                  Vessel categories
                </div>
              </>
            )}
            {nearest.length === 0 && (
              <div className="filter-section-title">Vessel categories</div>
            )}
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
                    <span className="category-swatch" style={{ background: CATEGORY_COLORS[cat] }} />
                    <span className="category-label">{CATEGORY_LABELS[cat]}</span>
                    <span className="category-count">{categoryCounts[cat] ?? 0}</span>
                  </button>
                );
              })}
            </div>

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
              <button className={`layer-toggle ${showBuoys ? 'on' : ''}`} onClick={() => setShowBuoys(!showBuoys)}>
                <Waves size={14} />
                <span>Sea state</span>
              </button>
              <button className={`layer-toggle ${showAton ? 'on' : ''}`} onClick={() => setShowAton(!showAton)}>
                <TriangleAlert size={14} />
                <span>AtoN faults</span>
              </button>
            </div>

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
    </BottomSheet>
  );
};
