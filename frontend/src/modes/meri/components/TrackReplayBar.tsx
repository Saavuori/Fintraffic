import React from 'react';
import { Play, Pause, SkipBack, X, Gauge } from 'lucide-react';
import type { TrackReplay } from '../hooks/useTrackReplay';
import { TRACK_REPLAY_SPEEDS } from '../hooks/useTrackReplay';

/** The playhead can sit days back, so the date is part of the readout — a bare
 *  clock would be ambiguous over anything but the 1h window. */
function fmtStamp(epochSec: number): string {
  if (!epochSec) return '--:--';
  return new Date(epochSec * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 h 12 min" / "6 d 4 h" — how much recorded time the track covers. */
function fmtSpan(sec: number): string {
  if (sec <= 0) return '';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} d${h > 0 ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${m > 0 ? ` ${m} min` : ''}`;
  return `${m} min`;
}

interface TrackReplayBarProps {
  replay: TrackReplay;
  vesselName: string;
}

/**
 * Transport bar for replaying one vessel's recorded track: restart, play/pause,
 * speed and a scrubber over the track's own time span. Shares the fleet
 * replay's chrome (`.replay-bar`) — the two are never on screen together — with
 * a modifier for what differs: this one names the ship it is rewinding.
 */
export const TrackReplayBar: React.FC<TrackReplayBarProps> = ({ replay, vesselName }) => {
  const {
    loading,
    from,
    to,
    playhead,
    playing,
    speed,
    fleetFrom,
    fleetCount,
    exit,
    togglePlay,
    setSpeed,
    seek,
    restart,
  } = replay;

  const atEnd = playhead >= to;
  // The surrounding traffic is fetched over a bounded window, so a long track
  // replays alone before it. Say where the other ships start rather than let
  // them appear out of nowhere mid-playback.
  const partialContext = fleetCount > 0 && fleetFrom > from + 60;

  return (
    <div className="replay-bar replay-bar--track">
      <div className="replay-row">
        <button
          className="icon-btn"
          onClick={restart}
          disabled={loading}
          aria-label="Back to start of track"
          title="Back to start of track"
        >
          <SkipBack size={15} />
        </button>

        <button
          className="replay-play"
          onClick={togglePlay}
          disabled={loading}
          aria-label={playing ? 'Pause' : atEnd ? 'Replay from start' : 'Play'}
          title={playing ? 'Pause' : atEnd ? 'Replay from start' : 'Play'}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <span className="replay-clock replay-clock--wide" aria-live="off">
          {loading ? 'Loading…' : fmtStamp(playhead)}
        </span>

        <label className="replay-speed" title="Playback speed">
          <Gauge size={13} />
          <select value={speed} disabled={loading} onChange={(e) => setSpeed(Number(e.target.value))}>
            {TRACK_REPLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>

        <button className="icon-btn replay-exit" onClick={exit} aria-label="Exit track replay" title="Exit track replay">
          <X size={15} />
        </button>
      </div>

      <input
        className="replay-scrubber"
        type="range"
        min={from}
        max={to}
        step={1}
        value={Math.min(Math.max(playhead, from), to) || from}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={loading || to <= from}
        aria-label="Scrub recorded track"
      />

      <div className="replay-meta">
        <span>{fmtStamp(from)}</span>
        <span className="replay-meta-mid">
          {loading ? (
            'Fetching recorded tracks…'
          ) : (
            <>
              {vesselName} · {fmtSpan(to - from)} recorded
              {partialContext ? ` · traffic from ${fmtStamp(fleetFrom)}` : ''}
            </>
          )}
        </span>
        <span>{fmtStamp(to)}</span>
      </div>
    </div>
  );
};
