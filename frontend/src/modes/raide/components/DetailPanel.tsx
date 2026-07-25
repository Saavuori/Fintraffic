import React, { useState } from 'react';
import { X, ChevronRight, ChevronDown, ChevronUp, TrainFront, MapPin } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { BottomSheet } from '../../../shared/components/BottomSheet';
import { BrowseButton } from '../../../shared/components/SheetViewSwitch';
import { useValueTick } from '../../../shared/hooks/useValueTick';
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
  isMobile: boolean;
  /** False while the phone's one sheet is showing the filters instead. */
  open?: boolean;
  /** Switches the phone's sheet to the filters without dropping the selection. */
  onShowBrowse?: () => void;
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
        {direction === 'to' ? '→ ' : '← '}
        {row.terminus}
      </span>
      <span className="board-track">{row.cancelled ? 'CANCELLED' : row.track || ''}</span>
    </div>
  );
}

/**
 * A train on a phone: the route it is running and the stops ahead of it. Speed
 * and delay are in the header readout, so the rail's telemetry tiles would only
 * repeat them; operator and category are reference, and fold.
 */
function TrainDetailMobile({ train }: { train: Train }) {
  const [showFacts, setShowFacts] = useState(false);

  return (
    <>
      <div className="vessel-trip">
        {train.dest && (
          <b className="vessel-trip-dest">
            {train.origin} → {train.dest}
          </b>
        )}
        {train.departTime && (
          <span className="vessel-trip-eta mono">
            {formatTime(train.departTime)}–{formatTime(train.arriveTime)}
          </span>
        )}
        {train.cancelled && <span className="delay-bad">Cancelled</span>}
      </div>

      {train.stops && train.stops.length > 0 && (
        <>
          <div className="section-label">Stops ahead</div>
          <div className="detail-facts">
            {train.stops.slice(0, 10).map(stop => (
              <div className="fact-row" key={`${stop.code}-${stop.scheduledTime}`}>
                <span>{stop.name}</span>
                <b>
                  {formatTime(stop.estimateTime || stop.scheduledTime)}
                  {stop.track ? ` · tr ${stop.track}` : ''}
                </b>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        className="detail-more-btn"
        onClick={() => setShowFacts(v => !v)}
        aria-expanded={showFacts}
      >
        {showFacts ? 'Hide details' : 'More details'}
        {showFacts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showFacts && (
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
          <div className="fact-row">
            <span>Train</span>
            <b>
              {train.trainType} {train.trainNumber}
            </b>
          </div>
        </div>
      )}
    </>
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
            {train.hasDelay ? delayText(train.delayMin, train.hasDelay) : '—'}
          </span>
        </div>
      </div>

      {(train.dest || train.departTime) && (
        <div className="destination-callout">
          {train.dest && (
            <div className="dest-row">
              <span>Route</span>
              <b>
                {train.origin} → {train.dest}
              </b>
            </div>
          )}
          {train.departTime && (
            <div className="dest-row">
              <span>Schedule</span>
              <b>
                {formatTime(train.departTime)} – {formatTime(train.arriveTime)}
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
                  {stop.track ? ` · tr ${stop.track}` : ''}
                </b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * A station's board. The rail stacks departures over arrivals; a phone gets a
 * segmented control instead — the two are the same shape, and stacking them
 * means scrolling past twelve departures to reach the first arrival.
 */
function StationDetail({ board, isMobile }: { board: Board | null; isMobile: boolean }) {
  const [side, setSide] = useState<'departures' | 'arrivals'>('departures');
  if (!board) return <p className="panel-note">Loading timetable…</p>;

  if (isMobile) {
    const rows = side === 'departures' ? board.departures.slice(0, 12) : board.arrivals.slice(0, 12);
    return (
      <>
        <div className="segmented" role="tablist" aria-label="Board direction">
          <button
            role="tab"
            aria-selected={side === 'departures'}
            className={`segmented-btn ${side === 'departures' ? 'active' : ''}`}
            onClick={() => setSide('departures')}
          >
            Departures
          </button>
          <button
            role="tab"
            aria-selected={side === 'arrivals'}
            className={`segmented-btn ${side === 'arrivals' ? 'active' : ''}`}
            onClick={() => setSide('arrivals')}
          >
            Arrivals
          </button>
        </div>
        {rows.length === 0 && (
          <p className="panel-note">No {side} in the next hours.</p>
        )}
        {rows.map(row => (
          <BoardRowView
            key={`${side}-${row.trainNumber}-${row.scheduledTime}`}
            row={row}
            direction={side === 'departures' ? 'to' : 'from'}
          />
        ))}
      </>
    );
  }

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
  isMobile,
  open = true,
  onShowBrowse,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;
  const speedTick = useValueTick(train?.speed ?? 0);

  const title = train ? trainTitle(train) : station?.name ?? '';
  const subtitle = train
    ? `${train.category}${train.commuterLine ? ` · Line ${train.commuterLine}` : ''}`
    : station?.code ?? '';

  return (
    <BottomSheet
      variant="detail"
      isMobile={isMobile}
      open={open}
      /* A train is a header, a route line and the stops ahead; a station is a
         board, and a board is a list that earns the taller stop. */
      restRatio={station ? 0.72 : 0.5}
      ariaLabel="Open details panel"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className={`detail-badge ${station ? 'station-badge' : ''}`}>
              {station ? <MapPin size={18} /> : <TrainFront size={18} />}
            </div>
            <div className="detail-title">
              <h3>{title}</h3>
              <span className="detail-subtitle">{subtitle}</span>
            </div>

            {/* The readout: how fast it is going and how late it is — the two
                numbers a train is watched for, in the row the peek shows. */}
            {isMobile && train && (
              <div className="vessel-readout">
                <span className={`readout-value ${speedTick}`}>
                  {train.speed}
                  <small>km/h</small>
                </span>
                <span className={`readout-sub ${train.hasDelay ? delayClass(train.delayMin) : ''}`}>
                  {delayText(train.delayMin, train.hasDelay)}
                </span>
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

          {train ? (
            isMobile ? (
              <TrainDetailMobile train={train} />
            ) : (
              <TrainDetail train={train} />
            )
          ) : (
            <StationDetail board={board} isMobile={isMobile} />
          )}
        </div>
      )}
    </BottomSheet>
  );
};
