import React, { useEffect, useState } from 'react';
import { X, ChevronRight, Navigation, Anchor as AnchorIcon } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { categorize, CATEGORY_COLORS, CATEGORY_LABELS, shipTypeText, navStatText } from '../lib/shipTypes';
import { fetchVesselDetails } from '../lib/api';
import type { Vessel, VesselDetailsResponse } from '../types';

interface VesselPopupProps {
  vessel: Vessel;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open vessel details'
  );
  const [details, setDetails] = useState<VesselDetailsResponse | null>(null);

  useEffect(() => {
    setDetails(null);
    let active = true;
    fetchVesselDetails(vessel.mmsi)
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch((err) => console.error('Failed to fetch vessel details:', err));
    return () => {
      active = false;
    };
  }, [vessel.mmsi]);

  const cat = categorize(vessel.shipType);
  const dims =
    details?.metadata?.referencePointA != null && details?.metadata?.referencePointB != null
      ? {
          length: (details.metadata.referencePointA ?? 0) + (details.metadata.referencePointB ?? 0),
          beam: (details.metadata.referencePointC ?? 0) + (details.metadata.referencePointD ?? 0),
        }
      : null;

  const etaText = formatEta(vessel.eta);
  const fixAge = Math.max(0, Math.round(Date.now() / 1000 - vessel.ts));

  return (
    <div className={`glass-panel detail-popup ${collapsedClass}`} {...collapsibleProps}>
      {!isCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className="vessel-badge" style={{ borderColor: CATEGORY_COLORS[cat] }}>
              {vessel.sog >= 0.2 ? <Navigation size={18} /> : <AnchorIcon size={18} />}
            </div>
            <div className="detail-title">
              <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
              <span className="detail-subtitle" style={{ color: CATEGORY_COLORS[cat] }}>
                {shipTypeText(vessel.shipType)} Â· {CATEGORY_LABELS[cat]}
              </span>
            </div>
            <button className="icon-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

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
                <small>Â°</small>
              </span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Heading</span>
              <span className="telemetry-value">
                {vessel.hdg != null ? (
                  <>
                    {vessel.hdg}
                    <small>Â°</small>
                  </>
                ) : (
                  'â€”'
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
                  'â€”'
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
                  {dims.length} Ã— {dims.beam} m
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
              <span>Last fix</span>
              <b>{fixAge < 60 ? `${fixAge}s ago` : `${Math.round(fixAge / 60)}min ago`}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
