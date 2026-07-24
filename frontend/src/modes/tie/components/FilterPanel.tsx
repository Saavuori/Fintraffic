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
} from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
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
  isMobile: boolean;
  /** False while a detail sheet is up on mobile — see BottomSheet's `open`. */
  open?: boolean;
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
        { label: 'Free flow (≥85% of baseline)', color: c.free },
        { label: 'Slowing (60–85% of baseline)', color: c.moderate },
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
  isMobile,
  open = true,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;

  const visibleKeys = LAYER_ORDER.filter(key => visibility[key]);

  return (
    <BottomSheet
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
              onToggleCollapse();
            }}
            aria-label="Collapse layers panel"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {!bodyCollapsed && (
        <div className="filter-content" onClick={stopPanelClick}>
          <div className="panel-stats">
            <span className="conn-dot" title="Live · Digitraffic" />
            <span>Live · Digitraffic</span>
          </div>

          <div className="filter-scroll-area">
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
    </BottomSheet>
  );
};
