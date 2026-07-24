import React, { useEffect, useState } from 'react';
import { X, ChevronRight, Navigation, Anchor as AnchorIcon } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { categorize, CATEGORY_COLORS, CATEGORY_LABELS, shipTypeText, navStatText } from '../lib/shipTypes';
import { fetchVesselDetails } from '../lib/api';
import { VesselActions } from './VesselActions';
import type { Vessel, VesselDetailsResponse } from '../types';

interface VesselPopupProps {
  vessel: Vessel;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  // On mobile the floating vessel card is hidden, so its follow / track-history
  // controls are relocated into this sheet's header.
  isFollowing: boolean;
  onToggleFollow: () => void;
  showTrail: boolean;
  onToggleTrail: () => void;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
  // During replay the selected vessel may not be transmitting live AIS at
  // all, so skip the live metadata fetch rather than show an unrelated ship.
  replayActive?: boolean;
}

function formatEta(eta?: string): string | null {
  if (!eta) return null;
  // Backend sends "MM-DD HH:MM" (UTC)
  const m = eta.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return eta;
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4])));
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const VesselPopup: React.FC<VesselPopupProps> = ({
  vessel,
  onClose,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  isFollowing,
  onToggleFollow,
  showTrail,
  onToggleTrail,
  trailWindowSec,
  onSetTrailWindow,
  replayActive = false,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const [details, setDetails] = useState<VesselDetailsResponse | null>(null);
  const [loadedMmsi, setLoadedMmsi] = useState(vessel.mmsi);
  // Ticking clock (ms) so the fix-age display stays current without reading
  // Date.now() during render, which is impure.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Reset immediately when the selected vessel changes (adjust state during
  // render, per React docs — not synchronously inside the effect).
  if (loadedMmsi !== vessel.mmsi) {
    setLoadedMmsi(vessel.mmsi);
    setDetails(null);
  }

  useEffect(() => {
    if (replayActive) return;
    let active = true;
    fetchVesselDetails(vessel.mmsi)
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch((err) => console.error('Failed to fetch vessel details:', err));
    return () => {
      active = false;
    };
  }, [vessel.mmsi, replayActive]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cat = categorize(vessel.shipType);
  const dims =
    details?.metadata?.referencePointA != null && details?.metadata?.referencePointB != null
      ? {
          length: (details.metadata.referencePointA ?? 0) + (details.metadata.referencePointB ?? 0),
          beam: (details.metadata.referencePointC ?? 0) + (details.metadata.referencePointD ?? 0),
        }
      : null;

  const etaText = formatEta(vessel.eta);
  const fixAge = Math.max(0, Math.round(nowMs / 1000 - vessel.ts));
  // During replay vessel.ts is a historical playhead timestamp, not a live AIS
  // fix — "3h ago" would read as stale reception rather than the point in the
  // past being played back, so show the actual recorded time instead.
  const positionTime = replayActive
    ? new Date(vessel.ts * 1000).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <BottomSheet
      variant="detail"
      isMobile={isMobile}
      open
      ariaLabel="Open vessel details"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className="vessel-badge" style={{ borderColor: CATEGORY_COLORS[cat] }}>
              {vessel.sog >= 0.2 ? <Navigation size={18} /> : <AnchorIcon size={18} />}
            </div>
            <div className="detail-title">
              <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
              <span className="detail-subtitle" style={{ color: CATEGORY_COLORS[cat] }}>
                {shipTypeText(vessel.shipType)} · {CATEGORY_LABELS[cat]}
              </span>
            </div>
            <button className="icon-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          {/* On mobile the floating card is hidden; surface its follow / trail
              controls here instead. */}
          {isMobile && !replayActive && (
            <div className="vessel-actions-row">
              <VesselActions
                isFollowing={isFollowing}
                onToggleFollow={onToggleFollow}
                showTrail={showTrail}
                onToggleTrail={onToggleTrail}
                trailWindowSec={trailWindowSec}
                onSetTrailWindow={onSetTrailWindow}
                replayActive={replayActive}
              />
            </div>
          )}

          <div className="telemetry-grid">
            <div className="telemetry-item">
              <span className="telemetry-label">Speed</span>
              <span className="telemetry-value">
                {vessel.sog.toFixed(1)} <small>kn</small>
              </span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Course</span>
              <span className="telemetry-value">
                {Math.round(vessel.cog)}
                <small>°</small>
              </span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Heading</span>
              <span className="telemetry-value">
                {vessel.hdg != null ? (
                  <>
                    {vessel.hdg}
                    <small>°</small>
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Draught</span>
              <span className="telemetry-value">
                {vessel.draught ? (
                  <>
                    {vessel.draught.toFixed(1)} <small>m</small>
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>

          <div className="status-callout">
            <span className="status-label">Status</span>
            <span className="status-value">{navStatText(vessel.navStat)}</span>
          </div>

          {(vessel.dest || etaText) && (
            <div className="destination-callout">
              {vessel.dest && (
                <div className="dest-row">
                  <span>Destination</span>
                  <b>{vessel.dest}</b>
                </div>
              )}
              {etaText && (
                <div className="dest-row">
                  <span>ETA</span>
                  <b>{etaText}</b>
                </div>
              )}
            </div>
          )}

          <div className="detail-facts">
            <div className="fact-row">
              <span>MMSI</span>
              <b>{vessel.mmsi}</b>
            </div>
            {vessel.imo ? (
              <div className="fact-row">
                <span>IMO</span>
                <b>{vessel.imo}</b>
              </div>
            ) : null}
            {vessel.callSign && (
              <div className="fact-row">
                <span>Call sign</span>
                <b>{vessel.callSign}</b>
              </div>
            )}
            {dims && dims.length > 0 && (
              <div className="fact-row">
                <span>Size</span>
                <b>
                  {dims.length} × {dims.beam} m
                </b>
              </div>
            )}
            <div className="fact-row">
              <span>Position</span>
              <b>
                {vessel.lat.toFixed(4)}, {vessel.lng.toFixed(4)}
              </b>
            </div>
            <div className="fact-row">
              <span>{replayActive ? 'Recorded' : 'Last fix'}</span>
              <b>
                {positionTime ?? (fixAge < 60 ? `${fixAge}s ago` : `${Math.round(fixAge / 60)}min ago`)}
              </b>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
