import React from 'react';
import { Play, Pause, SkipBack, Gauge } from 'lucide-react';
import type { TrackReplay } from '../hooks/useTrackReplay';
import { TRACK_REPLAY_SPEEDS } from '../hooks/useTrackReplay';
import { TRAIL_WINDOWS } from '../lib/trailWindows';
import { fmtSpan, fmtStamp } from '../lib/replayTime';

interface TrackReplayPanelProps {
  replay: TrackReplay;
  trailWindowSec: number;
  onSetTrailWindow: (sec: number) => void;
}

/**
 * The replay section of the top bar, unfolded underneath the vessel's name
 * whenever its track history is on screen. The window buttons set the trail's
 * span and the replay's range at once — the playback rewinds the very points
 * the trail is drawn from, so they are one range, not two — and the transport
 * below them stays operable from rest: play opens a session, and until then the
 * clock and the scrubber's scale already read the recorded window.
 */
export const TrackReplayPanel: React.FC<TrackReplayPanelProps> = ({
  replay,
  trailWindowSec,
  onSetTrailWindow,
}) => {
  const {
    available,
    active,
    loading,
    from,
    to,
    playhead,
    playing,
    speed,
    fleetFrom,
    fleetCount,
    togglePlay,
    setSpeed,
    seek,
    restart,
  } = replay;

  // At rest the playhead sits at the start of the recorded window rather than
  // at epoch zero, so the readout describes the track that would be played.
  const head = active ? Math.min(Math.max(playhead, from), to) : from;
  const atEnd = active && playhead >= to;
  const span = to - from;
  const scrubbable = active && !loading && to > from;
  // The surrounding traffic is fetched over a bounded window, so a long track
  // replays alone before it. Say where the other ships start rather than let
  // them appear out of nowhere mid-playback.
  const partialContext = active && fleetCount > 0 && fleetFrom > from + 60;

  return (
    <div className="track-replay-panel">
      <div className="replay-row">
        <span className="trail-window" role="group" aria-label="Track history window">
          {TRAIL_WINDOWS.map((w) => (
            <button
              key={w.sec}
              className={`trail-window-btn ${trailWindowSec === w.sec ? 'active' : ''}`}
              onClick={() => onSetTrailWindow(w.sec)}
              title={`Show and replay the last ${w.label} of this vessel's track`}
            >
              {w.label}
            </button>
          ))}
        </span>

        <button
          className="icon-btn"
          onClick={restart}
          disabled={loading || !available || !active}
          aria-label="Back to start of track"
          title="Back to start of track"
        >
          <SkipBack size={15} />
        </button>

        <button
          className="replay-play"
          onClick={togglePlay}
          disabled={loading || !available}
          aria-label={playing ? 'Pause' : atEnd ? 'Replay from start' : 'Replay recorded track'}
          title={
            !available
              ? 'No recorded track for this window yet'
              : playing
                ? 'Pause'
                : atEnd
                  ? 'Replay from start'
                  : 'Replay recorded track'
          }
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <span className="replay-clock replay-clock--wide" aria-live="off">
          {loading ? 'Loading…' : fmtStamp(head)}
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
      </div>

      <input
        className="replay-scrubber"
        type="range"
        min={from}
        max={to > from ? to : from + 1}
        step={1}
        value={head || from}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={!scrubbable}
        aria-label="Scrub recorded track"
      />

      <div className="replay-meta">
        <span>{span > 0 ? fmtStamp(from) : ''}</span>
        <span className="replay-meta-mid">
          {loading
            ? 'Fetching recorded tracks…'
            : !available
              ? 'No recorded track for this window yet'
              : `${fmtSpan(span)} recorded${partialContext ? ` · traffic from ${fmtStamp(fleetFrom)}` : ''}`}
        </span>
        <span>{span > 0 ? fmtStamp(to) : ''}</span>
      </div>
    </div>
  );
};
