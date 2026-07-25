import React from 'react';
import { X } from 'lucide-react';
import { categorize, CATEGORY_COLORS } from '../lib/shipTypes';
import { VesselActions } from './VesselActions';
import { TrackReplayPanel } from './TrackReplayPanel';
import type { TrackReplay } from '../hooks/useTrackReplay';
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
  trackReplay: TrackReplay;
  // Follow and trail act on the live layers, which are hidden during replay —
  // hide their controls so the card is info-only while playback runs.
  replayActive?: boolean;
}

/**
 * The top bar: a floating pill naming the selected vessel, with the follow and
 * track-history toggles. Switching the track history on unfolds the replay
 * panel underneath, so the recorded track can be scrubbed and played from the
 * same place it is switched on — the phone hides this bar entirely and gets the
 * same controls in the detail sheet and the bottom transport bar instead.
 */
export const VesselCard: React.FC<VesselCardProps> = ({
  vessel,
  onClose,
  isFollowing,
  onToggleFollow,
  showTrail,
  onToggleTrail,
  trailWindowSec,
  onSetTrailWindow,
  trackReplay,
  replayActive = false,
}) => {
  const cat = categorize(vessel.shipType);
  const replayOpen = showTrail && !replayActive;

  return (
    <div className={`vessel-card-overlay${replayOpen ? ' vessel-card-overlay--expanded' : ''}`}>
      <div className="vessel-card-row">
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
          showTrackControls={false}
          replayActive={replayActive}
        />

        <button className="icon-btn" onClick={onClose} aria-label="Deselect vessel">
          <X size={15} />
        </button>
      </div>

      {replayOpen && (
        <TrackReplayPanel
          replay={trackReplay}
          trailWindowSec={trailWindowSec}
          onSetTrailWindow={onSetTrailWindow}
        />
      )}
    </div>
  );
};
