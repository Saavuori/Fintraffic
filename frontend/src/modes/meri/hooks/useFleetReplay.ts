import { useCallback, useRef, useState } from 'react';
import { fetchFleetReplay } from '../lib/api';
import type { ReplayPoint } from '../types';

export interface ReplayControl {
  data: Record<string, ReplayPoint[]>;
  from: number;
  to: number;
  playing: boolean;
  speed: number;
  seekNonce: number;
  seekTs: number;
  onProgress: (ts: number) => void;
  onEnded: () => void;
}

export interface FleetReplay {
  active: boolean;
  // True whenever the transport bar should be on screen — includes the initial
  // load (before active flips) and error states, so the user gets feedback.
  visible: boolean;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  // Playback state surfaced for the transport UI.
  from: number;
  to: number;
  playhead: number;
  playing: boolean;
  speed: number;
  windowSec: number;
  vesselCount: number;
  // The control object handed to <Map>, or null when replay is off.
  control: ReplayControl | null;
  // Actions.
  enter: (windowSec: number) => void;
  exit: () => void;
  setWindow: (windowSec: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  seek: (ts: number) => void;
}

const SPEEDS = [30, 60, 120, 300];
export const REPLAY_SPEEDS = SPEEDS;

/**
 * Owns fleet-replay playback state: fetching a time window of recorded tracks
 * and driving the play/pause/scrub transport. The virtual clock itself lives in
 * <Map>'s rAF loop; this hook seeds it, receives throttled playhead updates
 * back via onProgress, and exposes everything the transport bar renders.
 */
export function useFleetReplay(): FleetReplay {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [data, setData] = useState<Record<string, ReplayPoint[]>>({});
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(60);
  const [windowSec, setWindowSec] = useState(3 * 3600);
  const [seek, setSeek] = useState<{ nonce: number; ts: number }>({ nonce: 0, ts: 0 });

  // Guards against a slow/stale fetch resolving after the user has moved on.
  const loadIdRef = useRef(0);

  const load = useCallback((win: number) => {
    const id = ++loadIdRef.current;
    const toSec = Date.now() / 1000;
    const fromSec = toSec - win;
    setLoading(true);
    setError(null);
    fetchFleetReplay(fromSec, toSec)
      .then((res) => {
        if (id !== loadIdRef.current) return;
        setData(res.vessels);
        setFrom(res.from);
        setTo(res.to);
        setTruncated(res.truncated);
        setPlayhead(res.from);
        setSeek({ nonce: Date.now(), ts: res.from });
        setPlaying(true);
        setActive(true);
        setLoading(false);
      })
      .catch((err) => {
        if (id !== loadIdRef.current) return;
        console.error('Failed to fetch fleet replay:', err);
        setError('Could not load replay history.');
        setLoading(false);
      });
  }, []);

  const enter = useCallback(
    (win: number) => {
      setWindowSec(win);
      load(win);
    },
    [load]
  );

  const setWindow = useCallback(
    (win: number) => {
      setWindowSec(win);
      load(win);
    },
    [load]
  );

  const exit = useCallback(() => {
    loadIdRef.current++; // abandon any in-flight fetch
    setActive(false);
    setPlaying(false);
    setData({});
    setError(null);
    setTruncated(false);
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // Restart from the beginning if paused at the very end.
      if (!p && playhead >= to) {
        setSeek({ nonce: Date.now(), ts: from });
        setPlayhead(from);
      }
      return !p;
    });
  }, [playhead, to, from]);

  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  const doSeek = useCallback((ts: number) => {
    setPlayhead(ts);
    setSeek({ nonce: Date.now(), ts });
  }, []);

  const onProgress = useCallback((ts: number) => setPlayhead(ts), []);
  const onEnded = useCallback(() => setPlaying(false), []);

  const control: ReplayControl | null = active
    ? {
        data,
        from,
        to,
        playing,
        speed,
        seekNonce: seek.nonce,
        seekTs: seek.ts,
        onProgress,
        onEnded,
      }
    : null;

  return {
    active,
    visible: active || loading || error !== null,
    loading,
    error,
    truncated,
    from,
    to,
    playhead,
    playing,
    speed,
    windowSec,
    vesselCount: Object.keys(data).length,
    control,
    enter,
    exit,
    setWindow,
    togglePlay,
    setSpeed,
    seek: doSeek,
  };
}
