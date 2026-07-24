import React from 'react';
import { X, ChevronRight, TrainFront, MapPin } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import {
  type Train,
  type StationMeta,
  type Board,
  type BoardRow,
  trainTitle,
  delayText,
  delayClass,
  formatTime,
} from '../lib/trains';

interface DetailPanelProps {
  train: Train | null;
  station: StationMeta | null;
  board: Board | null;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/** One line of a departure/arrival board. */
function BoardRowView({ row, direction }: { row: BoardRow; direction: 'to' | 'from' }) {
  const label = row.commuterLine || `${row.trainType} ${row.trainNumber}`;
  const late = row.delayMin >= 3 && row.liveTime;
  return (
    <div className={`board-row${row.cancelled ? ' board-cancelled' : ''}`}>
      <span className="board-time">
        {formatTime(row.scheduledTime)}
        {late && <span className={`board-live ${delayClass(row.delayMin)}`}> {formatTime(row.liveTime!)}</span>}
      </span>
      <span className="board-train">{label}</span>
      <span className="board-terminus">
        {direction === 'to' ? 'â†’ ' : 'â† '}
        {row.terminus}
      </span>
      <span className="board-track">{row.cancelled ? 'CANCELLED' : row.track || ''}</span>
    </div>
  );
}

function TrainDetail({ train }: { train: Train }) {
  return (
    <>
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Speed</span>
          <span className="telemetry-value">
            {train.speed} <small>km/h</small>
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Delay</span>
          <span className={`telemetry-value ${train.hasDelay ? delayClass(train.delayMin) : ''}`}>
            {train.hasDelay ? delayText(train.delayMin, train.hasDelay) : 'â€”'}
          </span>
        </div>
      </div>

      {(train.dest || train.departTime) && (
        <div className="destination-callout">
          {train.dest && (
            <div className="dest-row">
              <span>Route</span>
              <b>
                {train.origin} â†’ {train.dest}
              </b>
            </div>
          )}
          {train.departTime && (
            <div className="dest-row">
              <span>Schedule</span>
              <b>
                {formatTime(train.departTime)} â€“ {formatTime(train.arriveTime)}
              </b>
            </div>
          )}
        </div>
      )}

      <div className="detail-facts">
        {train.operator && (
          <div className="fact-row">
            <span>Operator</span>
            <b>{train.operator.toUpperCase()}</b>
          </div>
        )}
        <div className="fact-row">
          <span>Category</span>
          <b>{train.category}</b>
        </div>
        {train.cancelled && (
          <div className="fact-row">
            <span>Status</span>
            <b className="delay-bad">Cancelled</b>
          </div>
        )}
      </div>

      {train.stops && train.stops.length > 0 && (
        <>
          <div className="section-label">Upcoming stops</div>
          <div className="detail-facts">
            {train.stops.slice(0, 10).map(stop => (
              <div className="fact-row" key={`${stop.code}-${stop.scheduledTime}`}>
                <span>{stop.name}</span>
                <b>
                  {formatTime(stop.estimateTime || stop.scheduledTime)}
                  {stop.track ? ` Â· tr ${stop.track}` : ''}
                </b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function StationDetail({ board }: { board: Board | null }) {
  if (!board) return <p className="panel-note">Loading timetableâ€¦</p>;
  return (
    <>
      <div className="section-label">Departures</div>
      {board.departures.length === 0 && <p className="panel-note">No departures in the next hours.</p>}
      {board.departures.slice(0, 12).map(row => (
        <BoardRowView key={`d-${row.trainNumber}-${row.scheduledTime}`} row={row} direction="to" />
      ))}

      <div className="section-label">Arrivals</div>
      {board.arrivals.length === 0 && <p className="panel-note">No arrivals in the next hours.</p>}
      {board.arrivals.slice(0, 8).map(row => (
        <BoardRowView key={`a-${row.trainNumber}-${row.scheduledTime}`} row={row} direction="from" />
      ))}
    </>
  );
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  train,
  station,
  board,
  onClose,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open details panel'
  );

  const title = train ? trainTitle(train) : station?.name ?? '';
  const subtitle = train
    ? `${train.category}${train.commuterLine ? ` Â· Line ${train.commuterLine}` : ''}`
    : station?.code ?? '';

  return (
    <div className={`glass-panel detail-popup ${collapsedClass}`} {...collapsibleProps}>
      {!isCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className={`detail-badge ${station ? 'station-badge' : ''}`}>
              {station ? <MapPin size={18} /> : <TrainFront size={18} />}
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

          {train ? <TrainDetail train={train} /> : <StationDetail board={board} />}
        </div>
      )}
    </div>
  );
};
