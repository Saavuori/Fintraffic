import React, { useMemo, useState } from 'react';
import { Ship, Anchor, Waves, TriangleAlert, Moon, Sun, ChevronLeft, History, Video, Search, X } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, categorize, type ShipCategory } from '../lib/shipTypes';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import type { AtonFaultFeature, Vessel } from '../types';

const MAX_SEARCH_RESULTS = 8;

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
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open filters panel'
  );

  const [searchTerm, setSearchTerm] = useState('');

  // Search runs over the full live fleet, independent of the category filter,
  // so finding a specific vessel doesn't require first clearing filters.
  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return Object.values(vessels)
      .filter((v) => (v.name && v.name.toLowerCase().includes(q)) || String(v.mmsi).includes(q))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [vessels, searchTerm]);

  const handlePickResult = (mmsi: number) => {
    onSelectVessel(mmsi);
    setSearchTerm('');
  };

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

          <div className="vessel-search">
            <Search size={14} className="vessel-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="vessel-search-input"
              placeholder="Search by name or MMSI"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search vessels by name or MMSI"
            />
            {searchTerm && (
              <button
                className="vessel-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
            {searchTerm && (
              <div className="vessel-search-results" role="listbox">
                {searchResults.length === 0 && <div className="panel-note">No vessels match.</div>}
                {searchResults.map((v) => {
                  const cat = categorize(v.shipType);
                  return (
                    <button
                      key={v.mmsi}
                      className="vessel-search-result"
                      role="option"
                      aria-selected="false"
                      onClick={() => handlePickResult(v.mmsi)}
                    >
                      <span className="vessel-search-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                      <span className="vessel-search-name">{v.name || `MMSI ${v.mmsi}`}</span>
                      <span className="vessel-search-mmsi">{v.mmsi}</span>
                    </button>
                  );
                })}
              </div>
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
                className={`layer-toggle ${showWebcams ? 'on' : ''}`}
                onClick={() => setShowWebcams(!showWebcams)}
              >
                <Video size={14} />
                <span>Webcams</span>
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
