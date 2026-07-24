import React from 'react';
import { X } from 'lucide-react';
import type { Selection } from './DetailPanel';
import { directionalStatuses, stationVolume, congestionColors, type CongestionLevel } from '../lib/traffic';
import { parkingColors, parkingLevel } from '../lib/parking';
import { chargingColors, chargingLevel, availabilityText } from '../lib/charging';
import { weathercamColor } from '../lib/weathercam';
import type { Theme } from '../lib/theme';

interface SelectedCardProps {
  selection: Selection;
  theme: Theme;
  onClose: () => void;
}

/** Dot color + name + one live stat for the selected marker, per kind. */
function summary(selection: Selection, theme: Theme): { dot: string; name: string; stat: string } {
  switch (selection.kind) {
    case 'station': {
      const [dir1, dir2] = directionalStatuses(selection.station);
      const volume = stationVolume(selection.station);
      // Worst of the two directions drives the single card dot.
      const rank: Record<CongestionLevel, number> = { heavy: 3, moderate: 2, free: 1, unknown: 0 };
      const worst = rank[dir1.level] >= rank[dir2.level] ? dir1.level : dir2.level;
      const fmt = (v: number | null) => (v != null ? Math.round(v) : '–');
      const hasSpeed = dir1.speed != null || dir2.speed != null;
      return {
        dot: congestionColors(theme)[worst],
        name: selection.station.name,
        stat: hasSpeed ? `${fmt(dir1.speed)} / ${fmt(dir2.speed)} km/h · ${volume}/5 min` : 'No data',
      };
    }
    case 'parking': {
      const f = selection.facility;
      return {
        dot: parkingColors(theme)[parkingLevel(f)],
        name: f.name,
        stat: `${f.spacesAvailable ?? '—'} / ${f.capacity} free`,
      };
    }
    case 'camera':
      return {
        dot: weathercamColor(theme),
        name: selection.camera.name,
        stat: `${selection.camera.presets.length} view(s)`,
      };
    case 'charger':
      return {
        dot: chargingColors(theme)[chargingLevel(selection.charger)],
        name: selection.charger.name,
        stat: availabilityText(selection.charger),
      };
  }
}

/**
 * Floating summary strip pinned to the top-center of the map, mirroring the
 * marinetraffic / railway sibling cards.
 */
export const SelectedCard: React.FC<SelectedCardProps> = ({ selection, theme, onClose }) => {
  const { dot, name, stat } = summary(selection, theme);

  return (
    <div className="selected-card-overlay">
      <span className="selected-card-dot" style={{ background: dot }} />
      <span className="selected-card-name">{name}</span>
      <span className="selected-card-stat">{stat}</span>
      <button className="icon-btn" onClick={onClose} aria-label="Clear selection">
        <X size={15} />
      </button>
    </div>
  );
};
