import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFleetReplay } from '../lib/api';
import type { ReplayPoint, TrailPoint } from '../types';

/** The selected vessel's interpolated pose at the track playhead. */
export interface TrackReplayPose {
  mmsi: number;
  lat: number;
  lng: number;
  cog: number;
  sog: number;
  ts: number;
}

/** Everything <Map> needs to animate one vessel along its recorded track. */
export interface TrackReplayControl {
  mmsi: number;
  points: TrailPoint[];
  from: number; // first recorded fix in the window, epoch seconds
  to: number; // last recorded fix, epoch seconds
  playing: boolean;
  // Virtual seconds of recorded time per real second — derived from the track's
  // own span, not a fixed multiplier (see TRACK_PLAYBACK_SECONDS).
  rate: number;
  seekNonce: number; // bump to force the playhead to seekTs
  seekTs: number;
  // Every other vessel's recorded track over the same window, keyed by MMSI, so
  // the surrounding traffic rewinds along with the one being followed. Empty
  // when the context couldn't be loaded — playback still runs, just alone.
  fleet: Record<string, ReplayPoint[]>;
  onProgress: (ts: number) => void;
  onEnded: () => void;
  onPose: (pose: TrackReplayPose | null) => void;
}

export interface TrackReplay {
  // True when the selected vessel has enough recorded history to replay.
  available: boolean;
  active: boolean;
  // True while the surrounding traffic is being fetched, before playback opens.
  loading: boolean;
  playing: boolean;
  speed: number;
  from: number;
  to: number;
  playhead: number;
  // Start of the loaded surrounding traffic. Equals `from` when the context
  // covers the whole track; later when the window had to be clamped; 0 when
  // there is no context at all.
  fleetFrom: number;
  fleetCount: number;
  // Interpolated pose at the playhead, refreshed by <Map>'s rAF loop so the
  // detail panel reads historical speed/course during playback.
  pose: TrackReplayPose | null;
  // The control object handed to <Map>, or null when playback is off.
  control: TrackReplayControl | null;
  // Actions.
  toggle: () => void;
  exit: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  seek: (ts: number) => void;
  restart: () => void;
}

/**
 * How long a whole track takes to play back at 1×, in real seconds. A per-vessel
 * track spans anything from an hour to 60 days, so a fixed wall-clock multiplier
 * (what the fleet replay uses, where every window is the same shape) would make
 * short tracks flash past and long ones unwatchable. Scaling to the track's own
 * span keeps every window the same length to watch; the speed control then
 * stretches or compresses that.
 */
export const TRACK_PLAYBACK_SECONDS = 30;

/** Speed multipliers applied to TRACK_PLAYBACK_SECONDS. */
export const TRACK_REPLAY_SPEEDS = [0.5, 1, 2, 4];

/**
 * How far back the surrounding traffic is loaded. Every active vessel
 * contributes points, so this is the expensive half of the request — 6h is what
 * the fleet replay itself offers as its widest window, and a known-good payload.
 * Track windows reach 60 days, so a long one replays with recorded traffic over
 * its final hours and the ship alone before that; the transport bar says so.
 */
const FLEET_CONTEXT_MAX_SEC = 6 * 3600;

interface Session {
  from: number;
  to: number;
  fleet: Record<string, ReplayPoint[]>;
  fleetFrom: number;
}

/**
 * Owns playback state for the selected vessel's recorded track: the same points
 * the trail line is drawn from, animated as movement so the user can rewind
 * where the ship has been — and, with it, the traffic around it, fetched from
 * the same recorded history the fleet replay uses. The virtual clock lives in
 * <Map>'s rAF loop; this hook seeds it, takes throttled playhead/pose updates
 * back, and exposes what the transport bar renders.
 *
 * Playback is bound to the trail: it can only start while the track is on
 * screen, and it stands down whenever the selection, the window, or the trail
 * toggle changes underneath it, rather than replaying points that are no longer
 * the ones being drawn.
 */
export function useTrackReplay(
  mmsi: number | null,
  points: TrailPoint[],
  windowSec: number,
  enabled: boolean
): TrackReplay {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [playhead, setPlayhead] = useState(0);
  const [pose, setPose] = useState<TrackReplayPose | null>(null);
  const [seek, setSeek] = useState<{ nonce: number; ts: number }>({ nonce: 0, ts: 0 });

  const available = enabled && mmsi !== null && points.length >= 2;
  const trackFrom = points.length > 0 ? points[0][2] : 0;
  const trackTo = points.length > 0 ? points[points.length - 1][2] : 0;

  // Guards against a slow context fetch resolving after the user moved on —
  // either by leaving playback (the counter) or by changing what's selected
  // (the key, mirrored in a ref that effects refresh before any fetch settles).
  const loadIdRef = useRef(0);
  const keyRef = useRef('');

  // Stand down whenever what's being replayed changes out from under us: a
  // different ship, a different window, or the trail switched off. The trail
  // poll appends to the *same* selection every 30s and must NOT reset playback,
  // so this keys on those three and not on the points themselves. Adjusted
  // during render rather than in an effect, per the React docs.
  const key = `${mmsi}|${windowSec}|${enabled}`;
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setSession(null);
    setLoading(false);
    setPlaying(false);
    setPose(null);
  }
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const active = session !== null;

  /**
   * Freezes the window at the moment playback starts and loads the traffic
   * around it. The window is deliberately not re-derived from later trail
   * polls: an end that creeps forward mid-playback would keep moving the
   * scrubber's own scale under the user's finger.
   */
  const enter = useCallback(() => {
    if (mmsi === null || points.length < 2) return;
    const id = ++loadIdRef.current;
    const forKey = key;
    const from = points[0][2];
    const to = points[points.length - 1][2];
    const fleetFrom = Math.max(from, to - FLEET_CONTEXT_MAX_SEC);

    const open = (fleet: Record<string, ReplayPoint[]>, coveredFrom: number) => {
      if (id !== loadIdRef.current || keyRef.current !== forKey) return;
      setSession({ from, to, fleet, fleetFrom: coveredFrom });
      setLoading(false);
      setPlaying(true);
      setPlayhead(from);
      setPose(null);
      setSeek({ nonce: Date.now(), ts: from });
    };

    setLoading(true);
    fetchFleetReplay(fleetFrom, to)
      .then((res) => {
        // The followed vessel is drawn by its own ghost marker, so drop it from
        // the surrounding traffic rather than render it twice.
        const others = { ...res.vessels };
        delete others[String(mmsi)];
        open(others, res.from);
      })
      .catch((err) => {
        // The track itself is already in hand — replay it without the context
        // rather than refuse to start.
        console.error('Failed to fetch surrounding traffic for track replay:', err);
        open({}, 0);
      });
  }, [mmsi, points, key]);

  const exit = useCallback(() => {
    loadIdRef.current++;
    setSession(null);
    setLoading(false);
    setPlaying(false);
    setPose(null);
  }, []);

  const toggle = useCallback(() => {
    if (active || loading) exit();
    else if (available) enter();
  }, [active, loading, available, exit, enter]);

  const from = session?.from ?? trackFrom;
  const to = session?.to ?? trackTo;

  const restart = useCallback(() => {
    setPlaying(true);
    setPlayhead(from);
    setPose(null);
    setSeek({ nonce: Date.now(), ts: from });
  }, [from]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // Paused at the very end: play means start over.
      if (!p && playhead >= to) {
        setPlayhead(from);
        setSeek({ nonce: Date.now(), ts: from });
      }
      return !p;
    });
  }, [playhead, from, to]);

  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  const doSeek = useCallback((ts: number) => {
    setPlayhead(ts);
    setSeek({ nonce: Date.now(), ts });
  }, []);

  const onProgress = useCallback((ts: number) => setPlayhead(ts), []);
  const onEnded = useCallback(() => setPlaying(false), []);
  const onPose = useCallback((p: TrackReplayPose | null) => setPose(p), []);

  const rate = (Math.max(to - from, 1) / TRACK_PLAYBACK_SECONDS) * speed;

  const control: TrackReplayControl | null = useMemo(
    () =>
      session && mmsi !== null
        ? {
            mmsi,
            points,
            from: session.from,
            to: session.to,
            playing,
            rate,
            seekNonce: seek.nonce,
            seekTs: seek.ts,
            fleet: session.fleet,
            onProgress,
            onEnded,
            onPose,
          }
        : null,
    [session, mmsi, points, playing, rate, seek, onProgress, onEnded, onPose]
  );

  return {
    available,
    active,
    loading,
    playing,
    speed,
    from,
    to,
    playhead,
    fleetFrom: session?.fleetFrom ?? 0,
    fleetCount: session ? Object.keys(session.fleet).length : 0,
    pose: active ? pose : null,
    control,
    toggle,
    exit,
    togglePlay,
    setSpeed,
    seek: doSeek,
    restart,
  };
}
