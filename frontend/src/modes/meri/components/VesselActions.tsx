import React from 'react';
import { Crosshair, Route, Rewind } from 'lucide-react';

interface VesselActionsProps {
  isFollowing: boolean;
  onToggleFollow: () => void;
  showTrail: boolean;
  onToggleTrail: () => void;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
  // Replay of the selected vessel's own recorded track. Only offered while the
  // track is on screen — it animates the very points the trail is drawn from.
  trackReplayAvailable: boolean;
  trackReplayActive: boolean;
  onToggleTrackReplay: () => void;
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
  trackReplayAvailable,
  trackReplayActive,
  onToggleTrackReplay,
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
      {/* Stays mounted but disabled when there's nothing recorded yet, so the
          row doesn't reflow the instant a first fix lands. */}
      {showTrail && (
        <button
          className={`icon-btn track-replay-btn ${trackReplayActive ? 'active' : ''}`}
          onClick={onToggleTrackReplay}
          disabled={!trackReplayAvailable}
          aria-label={trackReplayActive ? 'Stop track replay' : 'Replay recorded track'}
          title={
            !trackReplayAvailable
              ? 'No recorded track for this window yet'
              : trackReplayActive
                ? 'Stop track replay'
                : 'Replay recorded track'
          }
        >
          <Rewind size={15} />
        </button>
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
