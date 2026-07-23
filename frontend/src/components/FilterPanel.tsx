import React from 'react';
import { Ship, Anchor, Waves, TriangleAlert, Moon, Sun, ChevronLeft, History } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../hooks/useCollapsiblePanel';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, type ShipCategory } from '../lib/shipTypes';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import type { AtonFaultFeature } from '../types';

interface FilterPanelProps {
  categoryCounts: Record<ShipCategory, number>;
  totalVessels: number;
  selectedCategories: ShipCategory[];
  onToggleCategory: (cat: ShipCategory) => void;
  onClearFilters: () => void;
  connectionStatus: ConnectionStatus;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mapTheme: 'light' | 'dark';
  setMapTheme: (theme: 'light' | 'dark') => void;
  showPorts: boolean;
  setShowPorts: (v: boolean) => void;
  showBuoys: boolean;
  setShowBuoys: (v: boolean) => void;
  showAton: boolean;
  setShowAton: (v: boolean) => void;
  atonFaults: AtonFaultFeature[];
  replayActive: boolean;
  onEnterReplay: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  categoryCounts,
  totalVessels,
  selectedCategories,
  onToggleCategory,
  onClearFilters,
  connectionStatus,
  isCollapsed,
  onToggleCollapse,
  mapTheme,
  setMapTheme,
  showPorts,
  setShowPorts,
  showBuoys,
  setShowBuoys,
  showAton,
  setShowAton,
  atonFaults,
  replayActive,
  onEnterReplay,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open filters panel'
  );

  return (
    <div className={`glass-panel filter-panel ${collapsedClass}`} {...collapsibleProps}>
      <div className="panel-header" onClick={isCollapsed ? undefined : stopPanelClick}>
        <div className="panel-title">
          <Ship size={16} />
          <span>Meriliikenne</span>
        </div>
        {!isCollapsed && (
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

      {!isCollapsed && (
        <div className="filter-content" onClick={stopPanelClick}>
          <div className="panel-stats">
            <span className={`conn-dot ${connectionStatus}`} title={connectionStatus} />
            <span>{totalVessels} vessels</span>
            {selectedCategories.length > 0 && (
              <button className="clear-filters-btn" onClick={onClearFilters}>
                Clear
              </button>
            )}
          </div>

          <div className="filter-scroll-area">
            <div className="filter-section-title">Ship types</div>
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
              Layers
            </div>
            <div className="layer-toggles">
              <button className={`layer-toggle ${showPorts ? 'on' : ''}`} onClick={() => setShowPorts(!showPorts)}>
                <Anchor size={14} />
                <span>Ports</span>
              </button>
              <button className={`layer-toggle ${showBuoys ? 'on' : ''}`} onClick={() => setShowBuoys(!showBuoys)}>
                <Waves size={14} />
                <span>Sea state</span>
              </button>
              <button className={`layer-toggle ${showAton ? 'on' : ''}`} onClick={() => setShowAton(!showAton)}>
                <TriangleAlert size={14} />
                <span>AtoN faults</span>
              </button>
              <button
                className="layer-toggle"
                onClick={() => setMapTheme(mapTheme === 'dark' ? 'light' : 'dark')}
              >
                {mapTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                <span>{mapTheme === 'dark' ? 'Light map' : 'Dark map'}</span>
              </button>
              <button
                className={`layer-toggle ${replayActive ? 'on' : ''}`}
                onClick={onEnterReplay}
                title="Replay recorded vessel movement"
              >
                <History size={14} />
                <span>Replay</span>
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
    </div>
  );
};
