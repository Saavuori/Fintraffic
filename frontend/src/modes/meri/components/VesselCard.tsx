import React from 'react';
import { X } from 'lucide-react';
import { categorize, CATEGORY_COLORS } from '../lib/shipTypes';
import { VesselActions } from './VesselActions';
import type { Vessel } from '../types';

interface VesselCardProps {
  vessel: Vessel;
  onClose: () => void;
  isFollowing: boolean;
  onToggleFollow: () => void;
  showTrail: boolean;
  onToggleTrail: () => void;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
  // Follow and trail act on the live layers, which are hidden during replay —
  // hide their controls so the card is info-only while playback runs.
  replayActive?: boolean;
}

export const VesselCard: React.FC<VesselCardProps> = ({
  vessel,
  onClose,
  isFollowing,
  onToggleFollow,
  showTrail,
  onToggleTrail,
  trailWindowSec,
  onSetTrailWindow,
  replayActive = false,
}) => {
  const cat = categorize(vessel.shipType);

  return (
    <div className="vessel-card-overlay">
      <span className="vessel-card-dot" style={{ background: CATEGORY_COLORS[cat] }} />
      <span className="vessel-card-name">{vessel.name || `MMSI ${vessel.mmsi}`}</span>
      <span className="vessel-card-stat">
        {vessel.sog.toFixed(1)} kn · {Math.round(vessel.cog)}°
      </span>
      {vessel.dest && <span className="vessel-card-dest">→ {vessel.dest}</span>}

      <VesselActions
        isFollowing={isFollowing}
        onToggleFollow={onToggleFollow}
        showTrail={showTrail}
        onToggleTrail={onToggleTrail}
        trailWindowSec={trailWindowSec}
        onSetTrailWindow={onSetTrailWindow}
        replayActive={replayActive}
      />

      <button className="icon-btn" onClick={onClose} aria-label="Deselect vessel">
        <X size={15} />
      </button>
    </div>
  );
};
