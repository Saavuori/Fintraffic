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
} from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { type TrainGroup, groupColors, CATEGORY_LABELS } from '../lib/trains';
import { type LayerKey, type LayerVisibility } from '../lib/layers';
import type { Theme } from '../lib/theme';

interface FilterPanelProps {
  total: number;
  counts: Record<TrainGroup, number>;
  visibility: LayerVisibility;
  onToggleLayer: (key: LayerKey) => void;
  theme: Theme;
  onToggleTheme: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
  visibility,
  onToggleLayer,
  theme,
  onToggleTheme,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open filters panel'
  );
  const colors = groupColors(theme);
  const anyHidden = GROUP_ORDER.some(g => !visibility[g]);

  return (
    <div className={`glass-panel filter-panel ${collapsedClass}`} {...collapsibleProps}>
      <div className="panel-header" onClick={isCollapsed ? undefined : stopPanelClick}>
        <div className="panel-title">
          <TrainFront size={16} />
          <span>Junat Live</span>
        </div>
        {!isCollapsed && (
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

      {!isCollapsed && (
        <div className="filter-content" onClick={stopPanelClick}>
          <div className="panel-stats">
            <span className="conn-dot" title="Live Â· updates every 10 s" />
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

          <div className="filter-scroll-area">
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

            <div className="filter-section-title" style={{ marginTop: 14 }}>
              Layers
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
              <button className="layer-toggle" onClick={onToggleTheme} style={{ gridColumn: '1 / -1' }}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                <span>{theme === 'dark' ? 'Light map' : 'Dark map'}</span>
              </button>
            </div>

            <div className="legend-hint">
              Yellow ring: 3+ min late Â· red ring: 10+ min. Click a station for its
              departures.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
