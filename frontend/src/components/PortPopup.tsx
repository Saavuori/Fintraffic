import React, { useEffect, useState } from 'react';
import { X, ChevronRight, Anchor, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../hooks/useCollapsiblePanel';
import { fetchPortCalls } from '../lib/api';
import type { Port, PortCall } from '../types';

interface PortPopupProps {
  port: Port;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectVessel: (mmsi: number) => void;
}

interface CallRow {
  key: string;
  vesselName: string;
  mmsi?: number;
  kind: 'arrival' | 'departure';
  time: Date;
  actual: boolean;
  berth?: string;
}

/** Flattens port calls into a chronological arrivals/departures board. */
function toRows(calls: PortCall[]): CallRow[] {
  const rows: CallRow[] = [];
  for (const call of calls) {
    for (const [i, area] of (call.portAreaDetails ?? []).entries()) {
      const arrival = area.ata ?? area.eta;
      const departure = area.atd ?? area.etd;
      if (arrival) {
        rows.push({
          key: `${call.portCallId}-${i}-a`,
          vesselName: call.vesselName,
          mmsi: call.mmsi,
          kind: 'arrival',
          time: new Date(arrival),
          actual: !!area.ata,
          berth: area.berthName || area.portAreaName,
        });
      }
      if (departure) {
        rows.push({
          key: `${call.portCallId}-${i}-d`,
          vesselName: call.vesselName,
          mmsi: call.mmsi,
          kind: 'departure',
          time: new Date(departure),
          actual: !!area.atd,
          berth: area.berthName || area.portAreaName,
        });
      }
    }
  }

  const now = Date.now();
  const windowStart = now - 6 * 3600_000;
  const windowEnd = now + 36 * 3600_000;
  return rows
    .filter((r) => r.time.getTime() >= windowStart && r.time.getTime() <= windowEnd)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

export const PortPopup: React.FC<PortPopupProps> = ({
  port,
  onClose,
  isCollapsed,
  onToggleCollapse,
  onSelectVessel,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open port details'
  );
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    let active = true;
    fetchPortCalls(port.locode)
      .then((data) => {
        if (active) setRows(toRows(data.portCalls ?? []));
      })
      .catch((err) => {
        console.error('Failed to fetch port calls:', err);
        if (active) setError('Failed to load port calls');
      });
    return () => {
      active = false;
    };
  }, [port.locode]);

  return (
    <div className={`glass-panel detail-popup ${collapsedClass}`} {...collapsibleProps}>
      {!isCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className="vessel-badge port-badge">
              <Anchor size={18} />
            </div>
            <div className="detail-title">
              <h3>{port.name}</h3>
              <span className="detail-subtitle">{port.locode}</span>
            </div>
            <button className="icon-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          <div className="filter-section-title">Arrivals &amp; departures</div>

          <div className="port-calls-list">
            {rows === null && !error && <div className="panel-note">Loading…</div>}
            {error && <div className="panel-note">{error}</div>}
            {rows !== null && rows.length === 0 && (
              <div className="panel-note">No port calls in the next 36 h.</div>
            )}
            {rows?.map((row) => (
              <button
                key={row.key}
                className="port-call-row"
                onClick={() => row.mmsi && onSelectVessel(row.mmsi)}
                disabled={!row.mmsi}
              >
                <span className={`call-kind ${row.kind}`}>
                  {row.kind === 'arrival' ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                </span>
                <span className="call-info">
                  <span className="call-vessel">{row.vesselName}</span>
                  {row.berth && <span className="call-berth">{row.berth}</span>}
                </span>
                <span className={`call-time ${row.actual ? 'actual' : ''}`}>
                  {row.time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  <small>
                    {row.time.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}
                    {row.actual ? '' : ' est'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
