import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/ui/Toast.jsx';
import { neighbourTrack, resolveRadio } from '../../utils/radioSchedule.js';
import { RANKING_PLAYLIST } from './rankingPlaylist.js';
import { RadioContext } from './radioContext.js';
import { useRankingRadio } from './useRankingRadio.js';
import './rankingMusic.css';

// Only an explicit mute is remembered; everyone else gets sound on by default.
const MUTED_KEY = 'ghn-ranking-radio-muted';
const SYNC_MS = 4000;
const DRIFT_SECONDS = 2;
const SEEK_COOLDOWN_MS = 8000;
const MAX_RETRIES = 5;

// Loaded only for devs; everyone else never downloads the editor.
const RankingMusicManager = lazy(() => import('./RankingMusicManager.jsx'));

function readMuted() {
  try { return localStorage.getItem(MUTED_KEY) === 'true'; }
  catch { return false; }
}

function writeMuted(muted) {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, 'true');
    else localStorage.removeItem(MUTED_KEY);
  } catch { /* Storage is optional. */ }
}

// One audio element for the whole app, so the radio keeps playing across tabs.
// It stays idle until `started` (the listener's first visit to the BXH tab).
// Every listener derives the same track and second from the shared schedule;
// skipping and track selection belong to devs.
export function RadioProvider({ started, canManage = false, children }) {
  const showToast = useToast();
  const radio = useRankingRadio({ enabled: started });
  const audioRef = useRef(null);
  const playAttempt = useRef(0);
  const radioRef = useRef(radio);
  const trackRef = useRef(null);
  const statusRef = useRef('idle');
  const lastSeekRef = useRef(0);
  const retriesRef = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState(() => !readMuted());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('idle');
  const [track, setTrack] = useState(null);
  const [managing, setManaging] = useState(false);

  const ready = started && radio.ready;
  const canPlay = ready && soundEnabled;
  // Without durations nothing can be scheduled, so the bundled track loops locally.
  const local = ready && !resolveRadio(radio.anchor, radio.tracks, radio.now());
  const shown = ready ? (track || (local ? RANKING_PLAYLIST[0] : null)) : null;

  useEffect(() => { radioRef.current = radio; }, [radio]);
  useEffect(() => { trackRef.current = shown; }, [shown]);
  useEffect(() => { statusRef.current = status; }, [status]);

  const startAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    const attempt = ++playAttempt.current;
    setStatus('loading');
    audio.volume = 0.3;
    audio.play().catch(error => {
      // AbortError = a newer load/pause superseded this call (track switch); the next attempt decides the status.
      if (attempt !== playAttempt.current || error.name === 'AbortError') return;
      setPlaying(false);
      setStatus(error.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }, []);

  // A dropped connection or a stalled stream is transient: reload the file a few times before showing an error.
  // onPlaying resets the counter.
  const retryAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || retriesRef.current >= MAX_RETRIES) return;
    retriesRef.current += 1;
    audio.load();
    startAudio();
  }, [startAudio]);

  // Seek only when this listener has drifted from the shared position. A cooldown keeps a slow
  // connection from chasing the schedule with back-to-back seeks (each one re-buffers).
  const align = useCallback((force = false) => {
    const audio = audioRef.current;
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    if (!audio || !resolved || resolved.track.id !== trackRef.current?.id || audio.readyState < 1 || audio.paused) return;
    if (!force && Date.now() - lastSeekRef.current < SEEK_COOLDOWN_MS) return;
    if (Math.abs(audio.currentTime - resolved.offset) > DRIFT_SECONDS) {
      lastSeekRef.current = Date.now();
      audio.currentTime = resolved.offset;
    }
  }, []);

  // Follow the schedule: switch tracks when the shared clock moves on, then correct drift.
  const sync = useCallback(() => {
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    if (!resolved) { setTrack(null); return; }
    setTrack(previous => (previous?.id === resolved.track.id ? previous : resolved.track));
    align();
  }, [align]);

  useEffect(() => { if (ready) sync(); }, [ready, radio.anchor, radio.tracks, sync]);

  useEffect(() => {
    if (!canPlay) return undefined;
    const timer = window.setInterval(() => {
      sync();
      // The browser can pause media on its own (resource limits, route changes); a radio keeps going.
      const audio = audioRef.current;
      if (statusRef.current === 'error') retryAudio();
      else if (audio?.paused && !audio.ended && statusRef.current !== 'blocked' && statusRef.current !== 'loading') startAudio();
    }, SYNC_MS);
    return () => window.clearInterval(timer);
  }, [canPlay, sync, startAudio, retryAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    const invalidateAttempt = () => { ++playAttempt.current; };
    if (!audio || !shown) return undefined;
    retriesRef.current = 0;
    if (canPlay) startAudio();
    else {
      ++playAttempt.current;
      audio.pause();
      setPlaying(false);
      setStatus('idle');
    }
    return () => { invalidateAttempt(); audio.pause(); };
    // Playback follows the listener's preference and the actual source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, shown?.src]);

  // Background tabs keep playing; if the browser suspended playback anyway, resume when the tab returns.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !canPlay) return;
      sync();
      if (audioRef.current?.paused) startAudio();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [canPlay, sync, startAudio]);

  const step = useCallback(async delta => {
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    const target = resolved && neighbourTrack(resolved.list, resolved.index, delta);
    if (!target) return;
    try { await live.play(target.id); }
    catch (error) { showToast(error.message || 'Không đổi được bài.', { tone: 'error' }); }
  }, [showToast]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !shown) return undefined;
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: shown.title, artist: 'Radio BXH' });
    // Media keys mean "listen / stop listening" for this person; they never move the shared radio.
    const handlers = {
      play: () => soundRef.current(true),
      pause: () => soundRef.current(false),
      ...(canManage ? { previoustrack: () => step(-1), nexttrack: () => step(1) } : { previoustrack: null, nexttrack: null })
    };
    for (const [action, handler] of Object.entries({ ...handlers, seekto: null, seekbackward: null, seekforward: null })) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    }
    return undefined;
  }, [shown, canManage, step]);

  const setSound = useCallback(on => {
    if (on) {
      setSoundEnabled(true);
      writeMuted(false);
      sync();
      // Keep play() inside the click gesture for browsers that block autoplay.
      startAudio();
    } else {
      ++playAttempt.current;
      audioRef.current?.pause();
      setPlaying(false);
      setStatus('idle');
      setSoundEnabled(false);
      writeMuted(true);
    }
  }, [sync, startAudio]);
  const soundRef = useRef(setSound);
  useEffect(() => { soundRef.current = setSound; }, [setSound]);
  const toggleSound = useCallback(
    () => setSound(!soundEnabled || status === 'blocked' || status === 'error'),
    [setSound, soundEnabled, status]
  );

  function handleEnded() {
    setPlaying(false);
    if (local) {
      if (canPlay) { audioRef.current.currentTime = 0; startAudio(); }
      return;
    }
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    if (!resolved) return;
    // Stored duration slightly longer than the real file: the schedule still says "same track", so move on.
    const next = resolved.track.id === trackRef.current?.id ? neighbourTrack(resolved.list, resolved.index, 1) : resolved.track;
    setTrack(next);
    if (next.id === trackRef.current?.id && canPlay) { audioRef.current.currentTime = 0; startAudio(); }
  }

  // Both widgets read this one variable, so progress never re-renders React.
  function handleTimeUpdate() {
    const audio = audioRef.current;
    const total = audio?.duration;
    if (!Number.isFinite(total) || total <= 0) return;
    document.documentElement.style.setProperty('--radio-progress', String(Math.min(1, audio.currentTime / total)));
  }

  useEffect(() => () => document.documentElement.style.removeProperty('--radio-progress'), []);

  const needsRetry = status === 'blocked' || status === 'error';
  const soundOn = soundEnabled && !needsRetry;
  const value = useMemo(() => ({
    ready: Boolean(shown),
    track: shown,
    playing,
    status,
    soundEnabled,
    soundOn,
    needsRetry,
    toggleSound,
    canControl: canManage,
    step,
    openManager: canManage ? () => setManaging(true) : undefined
  }), [shown, playing, status, soundEnabled, soundOn, needsRetry, toggleSound, canManage, step]);

  return (
    <RadioContext.Provider value={value}>
      {children}
      {ready && shown && <audio ref={audioRef} src={shown.src} preload="none"
        onLoadedMetadata={() => align(true)}
        onPlaying={() => { retriesRef.current = 0; setPlaying(true); setStatus('playing'); align(true); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => { setPlaying(false); setStatus('loading'); }}
        onTimeUpdate={handleTimeUpdate}
        onError={event => {
          const code = event.currentTarget.error?.code;
          // MEDIA_ERR_ABORTED is the user agent dropping a load we replaced ourselves, not a failure.
          if (code === 1) return;
          console.warn('[radio] audio error', { code, message: event.currentTarget.error?.message, src: event.currentTarget.currentSrc });
          ++playAttempt.current; setPlaying(false); setStatus('error');
        }}
        onEnded={handleEnded} />}
      {canManage && managing && <Suspense fallback={null}>
        <RankingMusicManager isOpen onClose={() => setManaging(false)} radio={radio} />
      </Suspense>}
    </RadioContext.Provider>
  );
}
