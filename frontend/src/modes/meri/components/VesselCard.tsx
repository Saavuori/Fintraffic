import React from 'react';
import { X, Crosshair, Route } from 'lucide-react';
import { categorize, CATEGORY_COLORS } from '../lib/shipTypes';
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
}

const TRAIL_WINDOWS: { label: string; sec: number }[] = [
  { label: '1h', sec: 3600 },
  { label: '24h', sec: 24 * 3600 },
  { label: '7d', sec: 7 * 24 * 3600 },
  { label: '60d', sec: 60 * 24 * 3600 },
];

export const VesselCard: React.FC<VesselCardProps> = ({
  vessel,
  onClose,
  isFollowing,
  onToggleFollow,
  showTrail,
  onToggleTrail,
  trailWindowSec,
  onSetTrailWindow,
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

      {showTrail && (
        <span className="trail-window" role="group" aria-label="Track history window">
          {TRAIL_WINDOWS.map((w) => (
            <button
              key={w.sec}
              className={`trail-window-btn ${trailWindowSec === w.sec ? 'active' : ''}`}
              onClick={() => onSetTrailWindow(w.sec)}
            >
              {w.label}
            </button>
          ))}
        </span>
      )}

      <button
        className={`icon-btn trail-btn ${showTrail ? 'active' : ''}`}
        onClick={onToggleTrail}
        aria-label={showTrail ? 'Hide track history' : 'Show track history'}
        title={showTrail ? 'Hide track history' : 'Show track history'}
      >
        <Route size={15} />
      </button>
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
