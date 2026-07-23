import React from 'react';
import { Play, Pause, X, Gauge, AlertTriangle } from 'lucide-react';
import type { FleetReplay } from '../hooks/useFleetReplay';
import { REPLAY_SPEEDS } from '../hooks/useFleetReplay';

const WINDOWS: { label: string; sec: number }[] = [
  { label: '1h', sec: 3600 },
  { label: '3h', sec: 3 * 3600 },
  { label: '6h', sec: 6 * 3600 },
];

function fmtClock(epochSec: number): string {
  if (!epochSec) return '--:--';
  return new Date(epochSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtStamp(epochSec: number): string {
  if (!epochSec) return '';
  return new Date(epochSec * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ReplayBarProps {
  replay: FleetReplay;
}

/** Bottom transport bar for the fleet playback: window, play/pause, speed, scrubber. */
export const ReplayBar: React.FC<ReplayBarProps> = ({ replay }) => {
  const {
    loading,
    error,
    truncated,
    from,
    to,
    playhead,
    playing,
    speed,
    windowSec,
    vesselCount,
    exit,
    setWindow,
    togglePlay,
    setSpeed,
    seek,
  } = replay;

  return (
    <div className="replay-bar">
      <div className="replay-row">
        <span className="replay-windows" role="group" aria-label="Replay window">
          {WINDOWS.map((w) => (
            <button
              key={w.sec}
              className={`replay-window-btn ${windowSec === w.sec ? 'active' : ''}`}
              onClick={() => setWindow(w.sec)}
              disabled={loading}
            >
              {w.label}
            </button>
          ))}
        </span>

        <button
          className="replay-play"
          onClick={togglePlay}
          disabled={loading || !!error}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <span className="replay-clock" aria-live="off">
          {loading ? 'Loading…' : fmtClock(playhead)}
        </span>

        <label className="replay-speed" title="Playback speed">
          <Gauge size={13} />
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {REPLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>

        <button className="icon-btn replay-exit" onClick={exit} aria-label="Exit replay" title="Exit replay">
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
        disabled={loading || !!error || to <= from}
        aria-label="Scrub replay timeline"
      />

      <div className="replay-meta">
        {error ? (
          <span className="replay-error">
            <AlertTriangle size={12} /> {error}
          </span>
        ) : loading ? (
          <span>Fetching recorded tracks…</span>
        ) : (
          <>
            <span>{fmtStamp(from)}</span>
            <span className="replay-meta-mid">
              {vesselCount} vessels{truncated ? ' · history capped' : ''}
            </span>
            <span>{fmtStamp(to)}</span>
          </>
        )}
      </div>
    </div>
  );
};
