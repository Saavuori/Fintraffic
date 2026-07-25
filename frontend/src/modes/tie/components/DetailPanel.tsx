import React from 'react';
import { X, ChevronRight, Gauge, SquareParking, Camera, Zap } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { BrowseButton } from '../../../shared/components/SheetViewSwitch';
import { Fold } from '../../../shared/components/Fold';
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
  isMobile: boolean;
  /** False while the phone's one sheet is showing the filters instead. */
  open?: boolean;
  /** Switches the phone's sheet to the filters without dropping the selection. */
  onShowBrowse?: () => void;
}

function StationDetail({ station, theme, isMobile }: { station: Station; theme: Theme; isMobile: boolean }) {
  const [dir1, dir2] = directionalStatuses(station);
  const volume = stationVolume(station);
  const colors = congestionColors(theme);
  return (
    <>
      {!isMobile && (
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Direction 1</span>
          <span className="telemetry-value" style={{ color: colors[dir1.level] }}>
            {dir1.speed != null ? Math.round(dir1.speed) : '—'} <small>km/h</small>
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Direction 2</span>
          <span className="telemetry-value" style={{ color: colors[dir2.level] }}>
            {dir2.speed != null ? Math.round(dir2.speed) : '—'} <small>km/h</small>
          </span>
        </div>
      </div>
      )}

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

      <Fold folded={isMobile} label="All sensors">
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
      </Fold>
    </>
  );
}

function ParkingDetail({ facility, isMobile }: { facility: ParkingFacility; isMobile: boolean }) {
  return (
    <>
      {!isMobile && (
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Available</span>
          <span className="telemetry-value">
            {facility.spacesAvailable ?? '—'} <small>/ {facility.capacity}</small>
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Open now</span>
          <span className="telemetry-value">
            {facility.openNow == null ? '—' : facility.openNow ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
      )}

      <Fold folded={isMobile} label="Capacity and opening hours">
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
      </Fold>
    </>
  );
}

function CameraDetail({ camera, isMobile }: { camera: WeathercamStation; isMobile: boolean }) {
  return (
    <>
      <div className="camera-grid">
        {camera.presets.map(preset => (
          <a key={preset.id} href={preset.imageUrl} target="_blank" rel="noreferrer">
            <img className="camera-thumb" src={preset.imageUrl} alt={`${camera.name} camera view`} />
          </a>
        ))}
      </div>

      <Fold folded={isMobile} label="Weather and location">
      {camera.weather && (
        <>
          <div className="section-label">
            Weather · {camera.weather.stationName} ({camera.weather.distanceKm} km)
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
      </Fold>
    </>
  );
}

function ChargerDetail({ charger, isMobile }: { charger: ChargingStation; isMobile: boolean }) {
  return (
    <>
      {!isMobile && (
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
            {charger.maxPowerKw >= 1 ? Math.round(charger.maxPowerKw) : '—'} <small>kW</small>
          </span>
        </div>
      </div>
      )}

      <Fold folded={isMobile} label="Address and operator">
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
      </Fold>

      {charger.connectors.length > 0 && (
        <>
          <div className="section-label">Connectors</div>
          <div className="detail-facts">
            {charger.connectors.map((c, i) => (
              <div className="fact-row" key={`${c.standard}-${c.powerType}-${i}`}>
                <span>{connectorLabel(c)}</span>
                <b>{priceLabel(c) ?? '—'}</b>
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
        subtitle: `TMS station · ${selection.station.id}`,
        badgeClass: '',
        Icon: Gauge,
      };
    case 'parking':
      return {
        title: selection.facility.name,
        subtitle: `Parking · ${humanizeEnum(selection.facility.type)}`,
        badgeClass: 'parking-badge',
        Icon: SquareParking,
      };
    case 'camera':
      return {
        title: selection.camera.name,
        subtitle: `Weather camera · ${selection.camera.id}`,
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

/**
 * The live number this selection is watched for, in the row the peek shows. A
 * TMS station's is the map marker itself: both directions' speeds, each in its
 * own congestion colour, split by a hairline the way the marker's halves are.
 */
function Readout({ selection, theme }: { selection: Selection; theme: Theme }) {
  switch (selection.kind) {
    case 'station': {
      const [dir1, dir2] = directionalStatuses(selection.station);
      const colors = congestionColors(theme);
      return (
        <div className="vessel-readout">
          <span className="readout-value readout-split">
            <span style={{ color: colors[dir1.level] }}>
              {dir1.speed != null ? Math.round(dir1.speed) : '—'}
            </span>
            <i aria-hidden="true">│</i>
            <span style={{ color: colors[dir2.level] }}>
              {dir2.speed != null ? Math.round(dir2.speed) : '—'}
            </span>
            <small>km/h</small>
          </span>
          <span className="readout-sub">{stationVolume(selection.station)} /5 min</span>
        </div>
      );
    }
    case 'parking':
      return (
        <div className="vessel-readout">
          <span className="readout-value">
            {selection.facility.spacesAvailable ?? '—'}
            <small>free</small>
          </span>
          <span className="readout-sub">of {selection.facility.capacity}</span>
        </div>
      );
    case 'charger':
      return (
        <div className="vessel-readout">
          <span className="readout-value">
            {selection.charger.maxPowerKw >= 1 ? Math.round(selection.charger.maxPowerKw) : '—'}
            <small>kW</small>
          </span>
          <span className="readout-sub">{availabilityText(selection.charger)}</span>
        </div>
      );
    // A camera's readout is the picture itself.
    case 'camera':
      return null;
  }
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  selection,
  theme,
  onClose,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  open = true,
  onShowBrowse,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;

  const { title, subtitle, badgeClass, Icon } = header(selection);

  return (
    <BottomSheet
      variant="detail"
      isMobile={isMobile}
      open={open}
      /* A camera is a picture, a charger is a connector list, and a station or
         a car park is a readout plus a fold. */
      restRatio={selection.kind === 'camera' ? 0.55 : selection.kind === 'charger' ? 0.5 : 0.38}
      ariaLabel="Open details panel"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className={`detail-badge ${badgeClass}`}>
              <Icon size={18} />
            </div>
            <div className="detail-title">
              <h3>{title}</h3>
              <span className="detail-subtitle">{subtitle}</span>
            </div>
            {isMobile && <Readout selection={selection} theme={theme} />}
            {isMobile && onShowBrowse && <BrowseButton onClick={onShowBrowse} />}
            <button className="icon-btn panel-collapse-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          {selection.kind === 'station' && (
            <StationDetail station={selection.station} theme={theme} isMobile={isMobile} />
          )}
          {selection.kind === 'parking' && <ParkingDetail facility={selection.facility} isMobile={isMobile} />}
          {selection.kind === 'camera' && <CameraDetail camera={selection.camera} isMobile={isMobile} />}
          {selection.kind === 'charger' && <ChargerDetail charger={selection.charger} isMobile={isMobile} />}
        </div>
      )}
    </BottomSheet>
  );
};
