import React, { useMemo, useState } from 'react';
import { X, ChevronRight, ChevronDown, ChevronUp, Plane, TowerControl, TriangleAlert } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BrowseButton } from '../../../shared/components/SheetViewSwitch';
import { useValueTick } from '../../../shared/hooks/useValueTick';
import {
  type Aircraft,
  type Airport,
  EMERGENCY_LABELS,
  GROUP_LABELS,
  SOURCE_LABELS,
  aircraftAround,
  aircraftTitle,
  altitudeMetres,
  altitudeShort,
  altitudeText,
  formatDistanceKm,
  speedKmh,
  speedText,
  trackText,
  verticalText,
  verticalTrend,
} from '../lib/aircraft';

interface DetailPanelProps {
  aircraft: Aircraft | null;
  airport: Airport | null;
  /** Every aircraft on the map, for an airport's traffic list. */
  allAircraft: Aircraft[];
  onSelectAircraft: (aircraft: Aircraft) => void;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  /** False while the phone's one sheet is showing the filters instead. */
  open?: boolean;
  /** Switches the phone's sheet to the filters without dropping the selection. */
  onShowBrowse?: () => void;
}

function EmergencyBanner({ aircraft }: { aircraft: Aircraft }) {
  if (!aircraft.emergency) return null;
  return (
    <div className="emergency-banner" role="status">
      <TriangleAlert size={15} aria-hidden="true" />
      <span>
        {EMERGENCY_LABELS[aircraft.emergency] ?? 'Emergency'}
        {aircraft.squawk ? ` · squawk ${aircraft.squawk}` : ''}
      </span>
    </div>
  );
}

/** When the position was fixed, to the second: a feed that has lost a target shows it here first. */
function fixTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Reference facts: what the aircraft is, rather than what it is doing. */
function AircraftFacts({ aircraft }: { aircraft: Aircraft }) {
  return (
    <div className="detail-facts">
      {aircraft.typeName && (
        <div className="fact-row">
          <span>Type</span>
          <b>
            {aircraft.typeName}
            {aircraft.typeCode ? ` (${aircraft.typeCode})` : ''}
          </b>
        </div>
      )}
      {aircraft.registration && (
        <div className="fact-row">
          <span>Registration</span>
          <b className="mono">{aircraft.registration}</b>
        </div>
      )}
      {aircraft.airline && (
        <div className="fact-row">
          <span>Operator</span>
          <b>{aircraft.airline}</b>
        </div>
      )}
      <div className="fact-row">
        <span>Kind</span>
        <b>{GROUP_LABELS[aircraft.group]}</b>
      </div>
      {aircraft.squawk && (
        <div className="fact-row">
          <span>Squawk</span>
          <b className="mono">{aircraft.squawk}</b>
        </div>
      )}
      <div className="fact-row">
        <span>ICAO address</span>
        <b className="mono">{aircraft.hex.toUpperCase()}</b>
      </div>
      <div className="fact-row">
        <span>Position</span>
        <b>
          {SOURCE_LABELS[aircraft.source]} · {fixTime(aircraft.timestamp)}
        </b>
      </div>
    </div>
  );
}

function AircraftDetail({ aircraft }: { aircraft: Aircraft }) {
  const trend = verticalTrend(aircraft.verticalRateFpm);
  return (
    <>
      <EmergencyBanner aircraft={aircraft} />
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Altitude</span>
          <span className="telemetry-value">{altitudeText(aircraft)}</span>
          {altitudeMetres(aircraft) && <span className="telemetry-sub">{altitudeMetres(aircraft)}</span>}
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Ground speed</span>
          <span className="telemetry-value">{speedText(aircraft)}</span>
          {speedKmh(aircraft) && <span className="telemetry-sub">{speedKmh(aircraft)}</span>}
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Vertical</span>
          <span className={`telemetry-value trend-${trend}`}>{verticalText(aircraft.verticalRateFpm)}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Track</span>
          <span className="telemetry-value">{trackText(aircraft.track)}</span>
        </div>
      </div>
      <AircraftFacts aircraft={aircraft} />
    </>
  );
}

/**
 * An aircraft on a phone: the header readout already carries altitude and
 * speed, so the sheet leads with what it is doing and folds the reference.
 */
function AircraftDetailMobile({ aircraft }: { aircraft: Aircraft }) {
  const [showFacts, setShowFacts] = useState(false);
  return (
    <>
      <EmergencyBanner aircraft={aircraft} />
      <div className="vessel-trip">
        <b className="vessel-trip-dest">{aircraft.typeName || aircraft.typeCode || GROUP_LABELS[aircraft.group]}</b>
        <span className="vessel-trip-eta mono">{trackText(aircraft.track)}</span>
        <span className={`trend-${verticalTrend(aircraft.verticalRateFpm)}`}>
          {verticalText(aircraft.verticalRateFpm)}
        </span>
      </div>

      <button className="detail-more-btn" onClick={() => setShowFacts(v => !v)} aria-expanded={showFacts}>
        {showFacts ? 'Hide details' : 'More details'}
        {showFacts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showFacts && <AircraftFacts aircraft={aircraft} />}
    </>
  );
}

/**
 * An airport: its codes, and the traffic at it right now — taxiing, on final,
 * climbing out. No schedule data is open for Finnish airports, so this is what
 * the receivers can see rather than a departures board.
 */
function AirportDetail({
  airport,
  allAircraft,
  onSelectAircraft,
}: {
  airport: Airport;
  allAircraft: Aircraft[];
  onSelectAircraft: (aircraft: Aircraft) => void;
}) {
  const around = useMemo(() => aircraftAround(airport, allAircraft), [airport, allAircraft]);
  return (
    <>
      <div className="detail-facts">
        <div className="fact-row">
          <span>ICAO / IATA</span>
          <b className="mono">
            {airport.icao}
            {airport.iata ? ` / ${airport.iata}` : ''}
          </b>
        </div>
        <div className="fact-row">
          <span>Elevation</span>
          <b>
            {airport.elevationFt} ft · {Math.round(airport.elevationFt * 0.3048)} m
          </b>
        </div>
        <div className="fact-row">
          <span>Service</span>
          <b>{airport.scheduled ? 'Scheduled flights' : 'Airfield, no scheduled flights'}</b>
        </div>
      </div>

      <div className="section-label">Traffic at the airport</div>
      {around.length === 0 && (
        <p className="panel-note">Nothing on the ground or low overhead within 25 km right now.</p>
      )}
      {around.map(({ aircraft, km }) => {
        const trend = verticalTrend(aircraft.verticalRateFpm);
        return (
          <button key={aircraft.hex} className="traffic-row" onClick={() => onSelectAircraft(aircraft)}>
            <span className="traffic-callsign">{aircraftTitle(aircraft)}</span>
            <span className="traffic-type">{aircraft.typeCode || ''}</span>
            <span className={`traffic-alt trend-${trend}`}>
              {altitudeShort(aircraft) || '—'}
              {trend === 'climb' ? ' ↑' : trend === 'descend' ? ' ↓' : ''}
            </span>
            <span className="traffic-dist">{formatDistanceKm(km)}</span>
          </button>
        );
      })}
    </>
  );
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  aircraft,
  airport,
  allAircraft,
  onSelectAircraft,
  onClose,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  open = true,
  onShowBrowse,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const altTick = useValueTick(aircraft?.altitudeFt ?? 0);

  const title = aircraft ? aircraftTitle(aircraft) : airport?.name ?? '';
  const subtitle = aircraft
    ? [aircraft.airline, aircraft.registration !== title ? aircraft.registration : null]
        .filter(Boolean)
        .join(' · ') || GROUP_LABELS[aircraft.group]
    : airport
      ? `${airport.icao}${airport.iata ? ` · ${airport.iata}` : ''}`
      : '';

  return (
    <Panel
      variant="detail"
      isMobile={isMobile}
      open={open}
      ariaLabel="Open details panel"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className={`detail-badge ${airport ? 'airport-badge' : ''}`}>
              {airport ? <TowerControl size={18} /> : <Plane size={18} />}
            </div>
            <div className="detail-title">
              <h3>{title}</h3>
              <span className="detail-subtitle">{subtitle}</span>
            </div>

            {/* The readout: how high and how fast — the two numbers an aircraft
                is watched for, in the row the phone's peek shows. */}
            {isMobile && aircraft && (
              <div className="vessel-readout">
                <span className={`readout-value ${altTick}`}>{altitudeShort(aircraft) || '—'}</span>
                <span className="readout-sub">{speedText(aircraft)}</span>
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

          {aircraft ? (
            isMobile ? (
              <AircraftDetailMobile aircraft={aircraft} />
            ) : (
              <AircraftDetail aircraft={aircraft} />
            )
          ) : airport ? (
            <AirportDetail airport={airport} allAircraft={allAircraft} onSelectAircraft={onSelectAircraft} />
          ) : null}
        </div>
      )}
    </Panel>
  );
};
