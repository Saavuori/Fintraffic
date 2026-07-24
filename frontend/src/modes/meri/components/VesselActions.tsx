import React from 'react';
import { Crosshair, Route } from 'lucide-react';

interface VesselActionsProps {
  isFollowing: boolean;
  onToggleFollow: () => void;
  showTrail: boolean;
  onToggleTrail: () => void;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
  // Follow and trail act on the live layers, which are hidden during replay —
  // render nothing so callers stay info-only while playback runs.
  replayActive?: boolean;
}

const TRAIL_WINDOWS: { label: string; sec: number }[] = [
  { label: '1h', sec: 3600 },
  { label: '24h', sec: 24 * 3600 },
  { label: '7d', sec: 7 * 24 * 3600 },
  { label: '60d', sec: 60 * 24 * 3600 },
];

/**
 * The follow / track-history controls shared by the floating vessel card
 * (desktop) and the detail sheet header (mobile). Kept in one place so the two
 * surfaces can't drift apart.
 */
export const VesselActions: React.FC<VesselActionsProps> = ({
  isFollowing,
  onToggleFollow,
  showTrail,
  onToggleTrail,
  trailWindowSec,
  onSetTrailWindow,
  replayActive = false,
}) => {
  if (replayActive) return null;

  return (
    <>
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
    </>
  );
};
