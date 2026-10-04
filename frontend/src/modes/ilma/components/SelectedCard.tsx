import React from 'react';
import { X } from 'lucide-react';
import {
  type Aircraft,
  type Airport,
  AIRPORT_COLORS,
  EMERGENCY_COLOR,
  aircraftTitle,
  altitudeShort,
  groupColors,
  speedText,
} from '../lib/aircraft';
import type { Theme } from '../lib/theme';

interface SelectedCardProps {
  aircraft: Aircraft | null;
  airport: Airport | null;
  theme: Theme;
  onClose: () => void;
}

/**
 * Floating summary strip pinned to the top-centre of the map, as in the other
 * modes: the selected flight's level and speed, or the selected airport's name.
 */
export const SelectedCard: React.FC<SelectedCardProps> = ({ aircraft, airport, theme, onClose }) => {
  if (!aircraft && !airport) return null;

  const dotColor = aircraft
    ? aircraft.emergency
      ? EMERGENCY_COLOR
      : groupColors(theme)[aircraft.group]
    : AIRPORT_COLORS[theme];

  return (
    <div className="flight-card-overlay">
      <span className="flight-card-dot" style={{ background: dotColor }} />
      {aircraft ? (
        <>
          <span className="flight-card-name">{aircraftTitle(aircraft)}</span>
          <span className="flight-card-stat">
            {[altitudeShort(aircraft), speedText(aircraft)].filter(Boolean).join(' · ')}
          </span>
          {(aircraft.airline || aircraft.typeCode) && (
            <span className="flight-card-extra">{aircraft.airline || aircraft.typeCode}</span>
          )}
        </>
      ) : (
        <>
          <span className="flight-card-name">{airport!.name}</span>
          <span className="flight-card-stat">
            {airport!.icao}
            {airport!.iata ? ` · ${airport!.iata}` : ''}
          </span>
        </>
      )}
      <button className="icon-btn" onClick={onClose} aria-label="Clear selection">
        <X size={15} />
      </button>
    </div>
  );
};
