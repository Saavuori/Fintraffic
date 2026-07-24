import React from 'react';
import {
  Activity,
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
} from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { type LayerKey, type LayerVisibility, LAYER_ORDER, LAYER_LABELS, poiColors } from '../lib/layers';
import { congestionColors } from '../lib/traffic';
import { parkingColors } from '../lib/parking';
import { chargingColors } from '../lib/charging';
import { weathercamColor } from '../lib/weathercam';
import { SPEED_SIGN_RING } from '../lib/speedLimits';
import type { Theme } from '../lib/theme';

interface FilterPanelProps {
  visibility: LayerVisibility;
  onToggleLayer: (key: LayerKey) => void;
  theme: Theme;
  onToggleTheme: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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

interface LegendItem {
  label: string;
  color: string;
}

// Color-key rows per layer, drawn from the same theme-aware helpers the map
// paints with, so a legend dot can never disagree with its marker.
function legendItems(key: LayerKey, theme: Theme): LegendItem[] {
  switch (key) {
    case 'stations': {
      const c = congestionColors(theme);
      return [
        { label: 'Free flow (â‰¥85% of baseline)', color: c.free },
        { label: 'Slowing (60â€“85% of baseline)', color: c.moderate },
        { label: 'Heavy slowdown (<60%)', color: c.heavy },
        { label: 'No data', color: c.unknown },
      ];
    }
    case 'roadworks':
      return [{ label: 'Road works', color: poiColors(theme).roadworks }];
    case 'incidents':
      return [{ label: 'Incidents', color: poiColors(theme).incidents }];
    case 'speedlimits':
      return [{ label: 'Current limit on a variable sign', color: SPEED_SIGN_RING }];
    case 'parking': {
      const c = parkingColors(theme);
      return [
        { label: 'Plenty of space', color: c.plenty },
        { label: 'Limited space', color: c.limited },
        { label: 'Full / closed', color: c.full },
      ];
    }
    case 'weathercams':
      return [{ label: 'Weather camera', color: weathercamColor(theme) }];
    case 'charging': {
      const c = chargingColors(theme);
      return [
        { label: 'Available', color: c.available },
        { label: 'Limited', color: c.limited },
        { label: 'Full / offline', color: c.full },
        { label: 'No live status', color: c.unknown },
      ];
    }
  }
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
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
    'Open layers panel'
  );

  const visibleKeys = LAYER_ORDER.filter(key => visibility[key]);

  return (
    <div className={`glass-panel filter-panel ${collapsedClass}`} {...collapsibleProps}>
      <div className="panel-header" onClick={isCollapsed ? undefined : stopPanelClick}>
        <div className="panel-title">
          <Activity size={16} />
          <span>Tieliikenne Live</span>
        </div>
        {!isCollapsed && (
          <button
            className="icon-btn"
            onClick={e => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            aria-label="Collapse layers panel"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="filter-content" onClick={stopPanelClick}>
          <div className="panel-stats">
            <span className="conn-dot" title="Live Â· Digitraffic" />
            <span>Live Â· Digitraffic</span>
          </div>

          <div className="filter-scroll-area">
            <div className="filter-section-title">Layers</div>
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
              <button className="layer-toggle" onClick={onToggleTheme} style={{ gridColumn: '1 / -1' }}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                <span>{theme === 'dark' ? 'Light map' : 'Dark map'}</span>
              </button>
            </div>

            <div className="filter-section-title" style={{ marginTop: 14 }}>
              Legend
            </div>
            {visibleKeys.length === 0 ? (
              <div className="legend-hint">No layers shown</div>
            ) : (
              <div className="legend-list">
                {visibleKeys.map(key => (
                  <div key={key}>
                    <div className="legend-group-title">{LAYER_LABELS[key]}</div>
                    {legendItems(key, theme).map(item => (
                      <div className="legend-row" key={item.label}>
                        <span className="legend-dot" style={{ backgroundColor: item.color }} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="legend-hint">
              Each half of a station dot is one direction, colored by its speed vs.
              seasonal free-flow speed (not the legal limit); dot size = volume. Click
              any marker for live details.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
