import React from 'react';
import { X } from 'lucide-react';
import {
  type Train,
  type StationMeta,
  trainGroup,
  trainTitle,
  groupColors,
  delayText,
  STATION_COLORS,
} from '../lib/trains';
import type { Theme } from '../lib/theme';

interface SelectedCardProps {
  train: Train | null;
  station: StationMeta | null;
  theme: Theme;
  onClose: () => void;
}

/**
 * Floating summary strip pinned to the top-center of the map, mirroring the
 * marinetraffic vessel card. Shows the selected train's live speed/delay, or a
 * selected station's name.
 */
export const SelectedCard: React.FC<SelectedCardProps> = ({ train, station, theme, onClose }) => {
  if (!train && !station) return null;

  const dotColor = train
    ? groupColors(theme)[trainGroup(train.category)]
    : STATION_COLORS[theme];

  return (
    <div className="train-card-overlay">
      <span className="train-card-dot" style={{ background: dotColor }} />
      {train ? (
        <>
          <span className="train-card-name">{trainTitle(train)}</span>
          <span className="train-card-stat">
            {train.speed} km/h · {delayText(train.delayMin, train.hasDelay)}
          </span>
          {train.dest && <span className="train-card-dest">→ {train.dest}</span>}
        </>
      ) : (
        <>
          <span className="train-card-name">{station!.name}</span>
          <span className="train-card-stat">{station!.code}</span>
        </>
      )}
      <button className="icon-btn" onClick={onClose} aria-label="Clear selection">
        <X size={15} />
      </button>
    </div>
  );
};
