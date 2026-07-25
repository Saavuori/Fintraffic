import React, { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronDown, ChevronUp, Navigation, Anchor as AnchorIcon } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { BrowseButton } from '../../../shared/components/SheetViewSwitch';
import { useValueTick } from '../../../shared/hooks/useValueTick';
import {
  categorize,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  shipTypeText,
  navStatText,
  isStationary,
} from '../lib/shipTypes';
import { fetchVesselDetails } from '../lib/api';
import { VesselActions } from './VesselActions';
import { CourseRose } from './CourseRose';
import { TrackReplayPanel } from './TrackReplayPanel';
import type { TrackReplay } from '../hooks/useTrackReplay';
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
  /** The selected vessel's own track playback, unfolded in the sheet on mobile. */
  trackReplay: TrackReplay;
  // During replay the selected vessel may not be transmitting live AIS at
  // all, so skip the live metadata fetch rather than show an unrelated ship.
  replayActive?: boolean;
  /** False while the phone's one sheet is showing the filters instead. */
  open?: boolean;
  /** Switches the phone's sheet to the filters without dropping the selection. */
  onShowBrowse?: () => void;
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
  trackReplay,
  replayActive = false,
  open = true,
  onShowBrowse,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const [details, setDetails] = useState<VesselDetailsResponse | null>(null);
  const [loadedMmsi, setLoadedMmsi] = useState(vessel.mmsi);
  // Phone only: the identity block (MMSI, IMO, dimensions, position, fix age) is
  // reference data, not something you watch — it starts folded so the sheet
  // opens at a height that leaves the map usable.
  const [showFacts, setShowFacts] = useState(false);
  // Ticking clock (ms) so the fix-age display stays current without reading
  // Date.now() during render, which is impure.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Reset immediately when the selected vessel changes (adjust state during
  // render, per React docs — not synchronously inside the effect).
  if (loadedMmsi !== vessel.mmsi) {
    setLoadedMmsi(vessel.mmsi);
    setDetails(null);
    setShowFacts(false);
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
  // A live number that changed gets one quiet pulse, so a still-looking readout
  // is visibly a still ship rather than a stalled feed.
  const speedTick = useValueTick(vessel.sog.toFixed(1));
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

  // The identity block, shared by both layouts: the desktop rail lists it under
  // the telemetry grid, the phone keeps it behind the "More details" fold. The
  // phone also parks heading and draught here — the rail shows them as tiles,
  // but on a sheet they're not worth a row each.
  const facts: Array<{ label: string; value: React.ReactNode }> = [];
  if (isMobile) {
    facts.push({ label: 'Heading', value: vessel.hdg != null ? `${vessel.hdg}°` : '—' });
    facts.push({ label: 'Draught', value: vessel.draught ? `${vessel.draught.toFixed(1)} m` : '—' });
  }
  facts.push({ label: 'MMSI', value: vessel.mmsi });
  if (vessel.imo) facts.push({ label: 'IMO', value: vessel.imo });
  if (vessel.callSign) facts.push({ label: 'Call sign', value: vessel.callSign });
  if (dims && dims.length > 0) {
    facts.push({ label: 'Size', value: `${dims.length} × ${dims.beam} m` });
  }
  facts.push({
    label: 'Position',
    value: `${vessel.lat.toFixed(4)}, ${vessel.lng.toFixed(4)}`,
  });
  facts.push({
    label: replayActive ? 'Recorded' : 'Last fix',
    value: positionTime ?? (fixAge < 60 ? `${fixAge}s ago` : `${Math.round(fixAge / 60)}min ago`),
  });

  const factList = (
    <div className="detail-facts">
      {facts.map((f) => (
        <div className="fact-row" key={f.label}>
          <span>{f.label}</span>
          <b>{f.value}</b>
        </div>
      ))}
    </div>
  );

  return (
    <BottomSheet
      variant="detail"
      className="vessel-sheet"
      /* Sized to the body, so nothing is left over for the map to lose. The
         three cases are the three heights the body actually has: no action row
         during a fleet replay, one row normally, two once the trail's window
         chips join it. Changing it mid-selection animates, so switching the
         trail on reads as the panel unfolding to make room. */
      restRatio={replayActive ? 0.34 : showTrail ? 0.58 : 0.43}
      isMobile={isMobile}
      open={open}
      ariaLabel="Open vessel details"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            {/* The phone's badge is the map's own arrow at the ship's own
                bearing; the desktop rail keeps the generic glyph. */}
            {isMobile ? (
              <CourseRose
                deg={vessel.hdg ?? vessel.cog}
                color={CATEGORY_COLORS[cat]}
                moving={!isStationary(vessel.sog, vessel.navStat)}
              />
            ) : (
              <div className="vessel-badge" style={{ borderColor: CATEGORY_COLORS[cat] }}>
                {vessel.sog >= 0.2 ? <Navigation size={18} /> : <AnchorIcon size={18} />}
              </div>
            )}
            <div className="detail-title">
              <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
              {/* The category's colour is on the rose beside it; repeating it in
                  the type line only costs contrast (several of those hues sit
                  near 2.5:1 on the light theme's white sheet). */}
              <span
                className="detail-subtitle"
                style={isMobile ? undefined : { color: CATEGORY_COLORS[cat] }}
              >
                {isMobile ? shipTypeText(vessel.shipType) : `${shipTypeText(vessel.shipType)} · ${CATEGORY_LABELS[cat]}`}
              </span>
            </div>

            {/* The readout: the two numbers you keep a ship selected for, in the
                one row a minimized sheet still shows. */}
            {isMobile && (
              <div className="vessel-readout">
                <span className={`readout-value ${speedTick}`}>
                  {vessel.sog.toFixed(1)}
                  <small>kn</small>
                </span>
                <span className="readout-sub">{Math.round(vessel.cog)}°</span>
              </div>
            )}

            {isMobile && onShowBrowse && <BrowseButton onClick={onShowBrowse} />}
            <button className="icon-btn panel-collapse-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
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
                /* The window chips and the transport live in the replay panel
                   below, which the trail toggle unfolds — the same arrangement
                   the desktop top bar uses, so the row here stays one line. */
                showTrackControls={false}
                replayActive={replayActive}
              />
            </div>
          )}

          {isMobile ? (
            /* The phone gets the voyage in one line — where it is going, when it
               arrives and what it is doing — and nothing else until asked. Speed
               and course are already in the header, so they aren't repeated. */
            <>
              <div className="vessel-trip">
                <span className="vessel-trip-status">{navStatText(vessel.navStat)}</span>
                {vessel.dest && <b className="vessel-trip-dest">→ {vessel.dest}</b>}
                {etaText && <span className="vessel-trip-eta">ETA {etaText}</span>}
              </div>

              {/* Track history on: the transport unfolds here rather than
                  floating over the map, next to the ship it is rewinding. */}
              {showTrail && !replayActive && (
                <TrackReplayPanel
                  replay={trackReplay}
                  trailWindowSec={trailWindowSec}
                  onSetTrailWindow={onSetTrailWindow}
                />
              )}

              <button
                className="detail-more-btn"
                onClick={() => setShowFacts((v) => !v)}
                aria-expanded={showFacts}
              >
                {showFacts ? 'Hide details' : 'More details'}
                {showFacts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showFacts && factList}
            </>
          ) : (
            <>
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

              {factList}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
};
