import React from 'react';
import { X, Crosshair } from 'lucide-react';
import { categorize, CATEGORY_COLORS } from '../lib/shipTypes';
import type { Vessel } from '../types';

interface VesselCardProps {
  vessel: Vessel;
  onClose: () => void;
  isFollowing: boolean;
  onToggleFollow: () => void;
}

export const VesselCard: React.FC<VesselCardProps> = ({
  vessel,
  onClose,
  isFollowing,
  onToggleFollow,
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
      <button
        className={`icon-btn follow-btn ${isFollowing ? 'active' : ''}`}
        onClick={onToggleFollow}
        aria-label={isFollowing ? 'Stop following' : 'Follow vessel'}
        title={isFollowing ? 'Stop following' : 'Follow vessel'}
      >
        <Crosshair size={15} />
      </button>
      <button className="icon-btn" onClick={onClose} aria-label="Deselect vessel">
        <X size={15} />
      </button>
    </div>
  );
};
