import React from 'react';
import { ChevronDown, X } from 'lucide-react';
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
  /**
   * Phone: the card is the whole of the selection on screen, so the transport
   * unfolds into the bar docked at the bottom instead of under the name, and
   * the row itself unfolds the details downward.
   */
  compact?: boolean;
  onOpenDetails?: () => void;
}

/**
 * The top bar: a floating pill naming the selected vessel, with the follow and
 * track-history toggles. Switching the track history on unfolds the replay
 * panel underneath, so the recorded track can be scrubbed and played from the
 * same place it is switched on.
 *
 * A phone gets the same card — what is selected belongs on the map, next to the
 * ship, not behind a page that covers it — but as a summary: speed, course and
 * destination, with the row itself the way into the full details and the
 * transport docked at the bottom of the screen (MeriApp).
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
  compact = false,
  onOpenDetails,
}) => {
  const cat = categorize(vessel.shipType);
  const replayOpen = showTrail && !replayActive && !compact;

  const identity = (
    <>
      <span className="vessel-card-dot" style={{ background: CATEGORY_COLORS[cat] }} />
      <span className="vessel-card-name">{vessel.name || `MMSI ${vessel.mmsi}`}</span>
      <span className="vessel-card-stat">
        {vessel.sog.toFixed(1)} kn · {Math.round(vessel.cog)}°
      </span>
      {vessel.dest && <span className="vessel-card-dest">→ {vessel.dest}</span>}
    </>
  );

  return (
    <div
      className={`vessel-card-overlay${replayOpen ? ' vessel-card-overlay--expanded' : ''}${
        compact ? ' vessel-card-overlay--compact' : ''
      }`}
    >
      <div className="vessel-card-row">
        {compact && onOpenDetails ? (
          /* The summary is the button: everything the card leaves out is one tap
             behind it, which is the only way to the full details from here. */
          <button
            className="vessel-card-open"
            onClick={onOpenDetails}
            aria-expanded={false}
            aria-label="Show vessel details"
          >
            {identity}
            <ChevronDown size={15} className="vessel-card-chevron" aria-hidden="true" />
          </button>
        ) : (
          identity
        )}

        {/* The phone's card is one row in the map's top strip, between the
            search and settings buttons, so it carries what a glance is for and
            nothing else. Follow and track history are in the page behind it,
            where they already are on a phone (VesselPopup). */}
        {!compact && (
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
        )}

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
