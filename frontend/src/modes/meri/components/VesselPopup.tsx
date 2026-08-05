import React, { useEffect, useState } from 'react';
import { X, ChevronRight, Navigation, Anchor as AnchorIcon, Route } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import {
  categorize,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  shipTypeText,
  navStatText,
} from '../lib/shipTypes';
import { fetchVesselDetails } from '../lib/api';
import { VesselHeadline } from './VesselHeadline';
import type { Vessel, VesselDetailsResponse } from '../types';

interface VesselPopupProps {
  vessel: Vessel;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  // On mobile the bar on the map carries the headline only, so the
  // track-history toggle is relocated into this sheet; the window chips and
  // the transport live in the docked replay bar the toggle unfolds.
  showTrail: boolean;
  onToggleTrail: () => void;
  // During replay the selected vessel may not be transmitting live AIS at
  // all, so skip the live metadata fetch rather than show an unrelated ship.
  replayActive?: boolean;
  /** False while the phone's one slot is showing the filters instead. */
  open?: boolean;
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
  showTrail,
  onToggleTrail,
  replayActive = false,
  open = true,
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

  // The identity block the desktop rail lists under its telemetry grid. The
  // phone lays the same values out as a grid of its own (below).
  const facts: Array<{ label: string; value: React.ReactNode }> = [];
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

  // Tight enough to stay on one line in a tile half the page wide.
  const sizeText = dims && dims.length > 0 ? `${dims.length}×${dims.beam} m` : '—';
  const fixText = positionTime ?? (fixAge < 60 ? `${fixAge}s ago` : `${Math.round(fixAge / 60)}min ago`);

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
    <Panel
      variant="detail"
      className="vessel-sheet"
      isMobile={isMobile}
      open={open}
      ariaLabel="Open vessel details"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div
            className="detail-header"
            /* The whole row is the control: tapping it opened the details and
               tapping it again puts them away. */
            onClick={isMobile ? onToggleCollapse : undefined}
            role={isMobile ? 'button' : undefined}
            tabIndex={isMobile ? 0 : undefined}
            aria-expanded={isMobile ? true : undefined}
            onKeyDown={
              isMobile
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleCollapse();
                    }
                  }
                : undefined
            }
          >
            {/* The phone opens with the very row the folded bar was showing —
                the same component, so unfolding adds the rest underneath and
                moves nothing. The desktop rail keeps its own generic glyph. */}
            {isMobile ? (
              <VesselHeadline vessel={vessel} />
            ) : (
              <>
                <div className="vessel-badge" style={{ borderColor: CATEGORY_COLORS[cat] }}>
                  {vessel.sog >= 0.2 ? <Navigation size={18} /> : <AnchorIcon size={18} />}
                </div>
                <div className="detail-title">
                  <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
                  {/* The category's colour is on the badge beside it; repeating
                      it in the type line only costs contrast (several of those
                      hues sit near 2.5:1 on the light theme's white sheet). */}
                  <span className="detail-subtitle" style={{ color: CATEGORY_COLORS[cat] }}>
                    {shipTypeText(vessel.shipType)} · {CATEGORY_LABELS[cat]}
                  </span>
                </div>
              </>
            )}

            {/* Desktop folds the rail into its sliver. A phone folds the details
                back by tapping the header itself — the same tap that opened
                them, so there is no separate control to find. */}
            {!isMobile && (
              <button
                className="icon-btn panel-collapse-btn"
                onClick={onToggleCollapse}
                aria-label="Collapse panel"
              >
                <ChevronRight size={16} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close panel"
            >
              <X size={16} />
            </button>
          </div>

          {isMobile ? (
            /* Everything the phone has to add, in two blocks rather than a
               column of identical rows: the voyage in one line, then what the
               ship is doing as tiles, then what the ship *is* — the numbers you
               copy out rather than watch — in a grid half as tall as the list it
               replaces. Speed and course are in the headline above, so they
               aren't repeated. */
            <>
              <div className="vessel-trip">
                <span className="vessel-trip-status">{navStatText(vessel.navStat)}</span>
                {vessel.dest && <b className="vessel-trip-dest">→ {vessel.dest}</b>}
                {etaText && <span className="vessel-trip-eta">ETA {etaText}</span>}
              </div>

              {/* The toggle left the headline so the name could have the line;
                  here it is a row of its own — the switch that draws the
                  recorded track and docks the transport for it at the bottom of
                  the map. The window chips live in that transport. */}
              {!replayActive && (
                <button
                  className={`track-history-row${showTrail ? ' active' : ''}`}
                  onClick={onToggleTrail}
                  aria-pressed={showTrail}
                >
                  <Route size={15} />
                  {showTrail ? 'Hide track history' : 'Show track history'}
                </button>
              )}

              <div className="vessel-stats">
                <div className="vessel-stat">
                  <span className="vessel-stat-label">Heading</span>
                  <span className="vessel-stat-value">
                    {vessel.hdg != null ? `${vessel.hdg}°` : '—'}
                  </span>
                </div>
                <div className="vessel-stat">
                  <span className="vessel-stat-label">Draught</span>
                  <span className="vessel-stat-value">
                    {vessel.draught ? `${vessel.draught.toFixed(1)} m` : '—'}
                  </span>
                </div>
                <div className="vessel-stat">
                  <span className="vessel-stat-label">Size</span>
                  <span className="vessel-stat-value">{sizeText}</span>
                </div>
                <div className="vessel-stat">
                  <span className="vessel-stat-label">{replayActive ? 'Recorded' : 'Last fix'}</span>
                  <span className="vessel-stat-value">{fixText}</span>
                </div>
              </div>

              <div className="vessel-ident">
                <div className="ident-cell">
                  <span className="ident-label">MMSI</span>
                  <span className="ident-value">{vessel.mmsi}</span>
                </div>
                {vessel.imo != null && (
                  <div className="ident-cell">
                    <span className="ident-label">IMO</span>
                    <span className="ident-value">{vessel.imo}</span>
                  </div>
                )}
                <div className="ident-cell ident-cell--wide">
                  <span className="ident-label">Position</span>
                  <span className="ident-value">
                    {vessel.lat.toFixed(4)}, {vessel.lng.toFixed(4)}
                  </span>
                </div>
              </div>
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
    </Panel>
  );
};
