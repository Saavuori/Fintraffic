import React from 'react';
import { X, ChevronRight, Gauge, SquareParking, Camera, Zap } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { type Station, directionalStatuses, stationVolume, congestionColors } from '../lib/traffic';
import type { Theme } from '../lib/theme';
import {
  type ParkingFacility,
  humanizeEnum,
  DAY_TYPE_ORDER,
  DAY_TYPE_LABELS,
} from '../lib/parking';
import { type WeathercamStation, formatWeatherReading } from '../lib/weathercam';
import {
  type ChargingStation,
  availabilityText,
  connectorLabel,
  priceLabel,
} from '../lib/charging';

export type Selection =
  | { kind: 'station'; station: Station }
  | { kind: 'parking'; facility: ParkingFacility }
  | { kind: 'camera'; camera: WeathercamStation }
  | { kind: 'charger'; charger: ChargingStation };

interface DetailPanelProps {
  selection: Selection;
  theme: Theme;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function StationDetail({ station, theme }: { station: Station; theme: Theme }) {
  const [dir1, dir2] = directionalStatuses(station);
  const volume = stationVolume(station);
  const colors = congestionColors(theme);
  return (
    <>
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Direction 1</span>
          <span className="telemetry-value" style={{ color: colors[dir1.level] }}>
            {dir1.speed != null ? Math.round(dir1.speed) : 'â€”'} <small>km/h</small>
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Direction 2</span>
          <span className="telemetry-value" style={{ color: colors[dir2.level] }}>
            {dir2.speed != null ? Math.round(dir2.speed) : 'â€”'} <small>km/h</small>
          </span>
        </div>
      </div>

      <div className="detail-facts">
        <div className="fact-row">
          <span>Volume (both directions)</span>
          <b>{volume} /5 min</b>
        </div>
        {dir1.freeFlow != null && (
          <div className="fact-row">
            <span>Free-flow speed (dir 1)</span>
            <b>{Math.round(dir1.freeFlow)} km/h</b>
          </div>
        )}
        {dir2.freeFlow != null && (
          <div className="fact-row">
            <span>Free-flow speed (dir 2)</span>
            <b>{Math.round(dir2.freeFlow)} km/h</b>
          </div>
        )}
      </div>

      <div className="section-label">Sensors</div>
      <div className="detail-facts">
        {station.data?.length ? (
          station.data.map(sensor => {
            const unit = sensor.unit && sensor.unit !== '***' ? ` ${sensor.unit}` : '';
            return (
              <div className="fact-row" key={sensor.id}>
                <span>{sensor.sensorValueDescriptionFI || `Sensor ${sensor.id}`}</span>
                <b>
                  {sensor.value.toFixed(1)}
                  {unit}
                </b>
              </div>
            );
          })
        ) : (
          <p className="panel-note">No sensor readings.</p>
        )}
      </div>
    </>
  );
}

function ParkingDetail({ facility }: { facility: ParkingFacility }) {
  return (
    <>
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Available</span>
          <span className="telemetry-value">
            {facility.spacesAvailable ?? 'â€”'} <small>/ {facility.capacity}</small>
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Open now</span>
          <span className="telemetry-value">
            {facility.openNow == null ? 'â€”' : facility.openNow ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      <div className="detail-facts">
        {facility.builtCapacity &&
          Object.entries(facility.builtCapacity).map(([capType, cap]) => (
            <div className="fact-row" key={capType}>
              <span>Capacity ({humanizeEnum(capType)})</span>
              <b>{cap}</b>
            </div>
          ))}
        {facility.openingHours &&
          DAY_TYPE_ORDER.filter(day => facility.openingHours?.[day]).map(day => (
            <div className="fact-row" key={day}>
              <span>{DAY_TYPE_LABELS[day]}</span>
              <b>{facility.openingHours![day]}</b>
            </div>
          ))}
        <div className="fact-row">
          <span>Type</span>
          <b>{humanizeEnum(facility.type)}</b>
        </div>
        <div className="fact-row">
          <span>Status</span>
          <b>{humanizeEnum(facility.status)}</b>
        </div>
        {facility.pricingMethod && (
          <div className="fact-row">
            <span>Pricing</span>
            <b>{humanizeEnum(facility.pricingMethod)}</b>
          </div>
        )}
        {facility.paymentMethods && facility.paymentMethods.length > 0 && (
          <div className="fact-row">
            <span>Payment</span>
            <b>{facility.paymentMethods.map(humanizeEnum).join(', ')}</b>
          </div>
        )}
        {facility.usages && facility.usages.length > 0 && (
          <div className="fact-row">
            <span>Usage</span>
            <b>{facility.usages.map(humanizeEnum).join(', ')}</b>
          </div>
        )}
        {facility.services && facility.services.length > 0 && (
          <div className="fact-row">
            <span>Services</span>
            <b>{facility.services.map(humanizeEnum).join(', ')}</b>
          </div>
        )}
        {facility.authenticationMethods && facility.authenticationMethods.length > 0 && (
          <div className="fact-row">
            <span>Authentication</span>
            <b>{facility.authenticationMethods.map(humanizeEnum).join(', ')}</b>
          </div>
        )}
        <div className="fact-row">
          <span>Coordinates</span>
          <b>
            {facility.latitude.toFixed(5)}, {facility.longitude.toFixed(5)}
          </b>
        </div>
        {facility.updatedAt && (
          <div className="fact-row">
            <span>Updated</span>
            <b>{new Date(facility.updatedAt).toLocaleString('fi-FI')}</b>
          </div>
        )}
      </div>
      {facility.paymentInfo && <p className="panel-note">{facility.paymentInfo}</p>}
    </>
  );
}

function CameraDetail({ camera }: { camera: WeathercamStation }) {
  return (
    <>
      <div className="camera-grid">
        {camera.presets.map(preset => (
          <a key={preset.id} href={preset.imageUrl} target="_blank" rel="noreferrer">
            <img className="camera-thumb" src={preset.imageUrl} alt={`${camera.name} camera view`} />
          </a>
        ))}
      </div>

      {camera.weather && (
        <>
          <div className="section-label">
            Weather Â· {camera.weather.stationName} ({camera.weather.distanceKm} km)
          </div>
          <div className="detail-facts">
            {camera.weather.readings.map(reading => (
              <div className="fact-row" key={reading.label}>
                <span>{reading.label}</span>
                <b>{formatWeatherReading(reading)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="detail-facts">
        <div className="fact-row">
          <span>Coordinates</span>
          <b>
            {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
          </b>
        </div>
      </div>
    </>
  );
}

function ChargerDetail({ charger }: { charger: ChargingStation }) {
  return (
    <>
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Availability</span>
          <span className="telemetry-value" style={{ fontSize: '0.9rem' }}>
            {availabilityText(charger)}
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Max power</span>
          <span className="telemetry-value">
            {charger.maxPowerKw >= 1 ? Math.round(charger.maxPowerKw) : 'â€”'} <small>kW</small>
          </span>
        </div>
      </div>

      <div className="detail-facts">
        {(charger.address || charger.city) && (
          <div className="fact-row">
            <span>Address</span>
            <b>{[charger.address, charger.city].filter(Boolean).join(', ')}</b>
          </div>
        )}
        {charger.website && (
          <div className="fact-row">
            <span>Operator site</span>
            <b>
              <a href={charger.website} target="_blank" rel="noreferrer" className="detail-link">
                Open
              </a>
            </b>
          </div>
        )}
      </div>

      {charger.connectors.length > 0 && (
        <>
          <div className="section-label">Connectors</div>
          <div className="detail-facts">
            {charger.connectors.map((c, i) => (
              <div className="fact-row" key={`${c.standard}-${c.powerType}-${i}`}>
                <span>{connectorLabel(c)}</span>
                <b>{priceLabel(c) ?? 'â€”'}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Title, subtitle, badge class, and icon for the header, per selection kind. */
function header(selection: Selection): {
  title: string;
  subtitle: string;
  badgeClass: string;
  Icon: React.ComponentType<{ size?: number }>;
} {
  switch (selection.kind) {
    case 'station':
      return {
        title: selection.station.name,
        subtitle: `TMS station Â· ${selection.station.id}`,
        badgeClass: '',
        Icon: Gauge,
      };
    case 'parking':
      return {
        title: selection.facility.name,
        subtitle: `Parking Â· ${humanizeEnum(selection.facility.type)}`,
        badgeClass: 'parking-badge',
        Icon: SquareParking,
      };
    case 'camera':
      return {
        title: selection.camera.name,
        subtitle: `Weather camera Â· ${selection.camera.id}`,
        badgeClass: 'camera-badge',
        Icon: Camera,
      };
    case 'charger':
      return {
        title: selection.charger.name,
        subtitle: selection.charger.operator || 'EV charging',
        badgeClass: 'charger-badge',
        Icon: Zap,
      };
  }
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  selection,
  theme,
  onClose,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open details panel'
  );

  const { title, subtitle, badgeClass, Icon } = header(selection);

  return (
    <div className={`glass-panel detail-popup ${collapsedClass}`} {...collapsibleProps}>
      {!isCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className={`detail-badge ${badgeClass}`}>
              <Icon size={18} />
            </div>
            <div className="detail-title">
              <h3>{title}</h3>
              <span className="detail-subtitle">{subtitle}</span>
            </div>
            <button className="icon-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          {selection.kind === 'station' && <StationDetail station={selection.station} theme={theme} />}
          {selection.kind === 'parking' && <ParkingDetail facility={selection.facility} />}
          {selection.kind === 'camera' && <CameraDetail camera={selection.camera} />}
          {selection.kind === 'charger' && <ChargerDetail charger={selection.charger} />}
        </div>
      )}
    </div>
  );
};
