import React from 'react';
import { X } from 'lucide-react';
import { categorize, CATEGORY_COLORS } from '../lib/shipTypes';
import { VesselActions } from './VesselActions';
import { VesselHeadline } from './VesselHeadline';
import { TrackReplayPanel } from './TrackReplayPanel';
import type { TrackReplay } from '../hooks/useTrackReplay';
import type { Vessel } from '../types';

interface VesselCardProps {
  vessel: Vessel;
  onClose: () => void;
  showTrail: boolean;
  onToggleTrail: () => void;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
  trackReplay: TrackReplay;
  // The trail acts on the live layers, which are hidden during replay — hide
  // its controls so the card is info-only while playback runs.
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
 * The top bar: a floating pill naming the selected vessel, with the
 * track-history toggle. Switching the track history on unfolds the replay panel
 * underneath, so the recorded track can be scrubbed and played from the same
 * place it is switched on.
 *
 * A phone gets the same card — what is selected belongs on the map, next to the
 * ship, not behind a page that covers it — carrying the same headline the page
 * behind it opens with, so tapping the row only ever adds to what is on screen.
 */
export const VesselCard: React.FC<VesselCardProps> = ({
  vessel,
  onClose,
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

  return (
    <div
      className={`vessel-card-overlay${replayOpen ? ' vessel-card-overlay--expanded' : ''}${
        compact ? ' vessel-card-overlay--compact' : ''
      }`}
    >
      <div className="vessel-card-row">
        {compact && onOpenDetails ? (
          /* The headline is the button: everything the bar leaves out is one tap
             behind it, which is the only way to the full details from here.
             Nothing sits beside the headline but the way out — a control's 40px
             is five characters of the name, and the name is what was tapped.
             Track history is a row of the page behind (VesselPopup). */
          <button
            className="vessel-card-open"
            onClick={onOpenDetails}
            aria-expanded={false}
            aria-label="Show vessel details"
          >
            <VesselHeadline vessel={vessel} />
          </button>
        ) : (
          <>
            <span className="vessel-card-dot" style={{ background: CATEGORY_COLORS[cat] }} />
            <span className="vessel-card-name">{vessel.name || `MMSI ${vessel.mmsi}`}</span>
            <span className="vessel-card-stat">
              {vessel.sog.toFixed(1)} kn · {Math.round(vessel.cog)}°
            </span>
            {vessel.dest && <span className="vessel-card-dest">→ {vessel.dest}</span>}
          </>
        )}

        {/* The phone's card is one row in the map's top strip, between the
            search and settings buttons, so it carries what a glance is for and
            nothing else. Track history is in the page behind it, where it
            already is on a phone (VesselPopup). */}
        {!compact && (
          <VesselActions
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
