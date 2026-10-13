import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '../../components/ui/Toast.jsx';
import { neighbourTrack, resolveRadio } from '../../utils/radioSchedule.js';
import { RANKING_PLAYLIST } from './rankingPlaylist.js';
import { useRankingRadio } from './useRankingRadio.js';
import './rankingMusic.css';

const PREFERENCE_KEY = 'ghn-ranking-music-enabled';
const SYNC_MS = 4000;
const DRIFT_SECONDS = 1.5;

// Loaded only for devs; everyone else never downloads the editor.
const RankingMusicManager = lazy(() => import('./RankingMusicManager.jsx'));

function readPreference() {
  try { return localStorage.getItem(PREFERENCE_KEY) === 'true'; }
  catch { return false; }
}

// Radio: every listener hears the same track at the same second. The widget only decides
// whether this listener has sound on; skipping and track selection belong to devs.
export default function RankingMusicWidget({ active = true, canManage = false }) {
  const radio = useRankingRadio();
  const [managing, setManaging] = useState(false);
  if (!radio.ready) return null;
  return (
    <>
      <RankingRadioPlayer active={active} radio={radio} canControl={canManage}
        onManage={canManage ? () => setManaging(true) : undefined} />
      {canManage && managing && <Suspense fallback={null}>
        <RankingMusicManager isOpen onClose={() => setManaging(false)} radio={radio} />
      </Suspense>}
    </>
  );
}

function RankingRadioPlayer({ active, radio, canControl, onManage }) {
  const showToast = useToast();
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const playAttempt = useRef(0);
  const radioRef = useRef(radio);
  const trackRef = useRef(null);
  const [enabled, setEnabled] = useState(readPreference);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('idle');
  const [track, setTrack] = useState(() => resolveRadio(radio.anchor, radio.tracks, radio.now())?.track || null);
  const canPlay = active && enabled;
  // Without durations nothing can be scheduled, so the bundled track loops locally.
  const local = !resolveRadio(radio.anchor, radio.tracks, radio.now());
  const shown = track || (local ? RANKING_PLAYLIST[0] : null);

  useEffect(() => { radioRef.current = radio; }, [radio]);
  useEffect(() => { trackRef.current = shown; }, [shown]);

  const startAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    const attempt = ++playAttempt.current;
    setStatus('loading');
    audio.volume = 0.3;
    audio.play().catch(error => {
      if (attempt !== playAttempt.current) return;
      setPlaying(false);
      setStatus(error.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }, []);

  // Seek only when this listener has drifted from the shared position.
  const align = useCallback(() => {
    const audio = audioRef.current;
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    if (!audio || !resolved || resolved.track.id !== trackRef.current?.id || audio.readyState < 1) return;
    if (Math.abs(audio.currentTime - resolved.offset) > DRIFT_SECONDS) audio.currentTime = resolved.offset;
  }, []);

  // Follow the schedule: switch tracks when the shared clock moves on, then correct drift.
  const sync = useCallback(() => {
    const live = radioRef.current;
    const resolved = resolveRadio(live.anchor, live.tracks, live.now());
    if (!resolved) { setTrack(null); return; }
    setTrack(previous => (previous?.id === resolved.track.id ? previous : resolved.track));
    align();
  }, [align]);

  useEffect(() => { sync(); }, [radio.anchor, radio.tracks, sync]);

  useEffect(() => {
    if (!canPlay) return undefined;
    const timer = window.setInterval(sync, SYNC_MS);
    return () => window.clearInterval(timer);
  }, [canPlay, sync]);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCE_KEY, String(enabled)); } catch { /* Storage is optional. */ }
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    const invalidateAttempt = () => { ++playAttempt.current; };
    if (!audio || !shown) return undefined;
    if (canPlay) startAudio();
    else {
      ++playAttempt.current;
      audio.pause();
      setPlaying(false);
      setStatus('idle');
    }
    return () => { invalidateAttempt(); audio.pause(); };
    // Playback follows scope, preference and the actual source.
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
    const handlers = canControl ? { previoustrack: () => step(-1), nexttrack: () => step(1) } : { previoustrack: null, nexttrack: null };
    for (const [action, handler] of Object.entries({ ...handlers, seekto: null, seekbackward: null, seekforward: null })) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    }
    return undefined;
  }, [shown, canControl, step]);

  function toggleSound() {
    if (!enabled || status === 'blocked' || status === 'error') {
      setEnabled(true);
      sync();
      // Keep play() inside the click gesture for browsers that block autoplay.
      if (active) startAudio();
    } else {
      ++playAttempt.current;
      audioRef.current?.pause();
      setPlaying(false);
      setStatus('idle');
      setEnabled(false);
    }
  }

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

  function handleTimeUpdate() {
    const audio = audioRef.current;
    const bar = progressRef.current;
    const total = audio?.duration;
    if (!bar || !Number.isFinite(total) || total <= 0) return;
    bar.style.transform = `scaleX(${Math.min(1, audio.currentTime / total)})`;
  }

  if (!shown) return null;
  const needsRetry = status === 'blocked' || status === 'error';
  const soundOn = enabled && !needsRetry;
  const label = status === 'error' ? 'Thử phát lại radio' : soundOn ? 'Tắt âm radio' : 'Bật radio';
  const description = status === 'error' ? 'Không tải được nhạc · Bấm để thử lại'
    : status === 'blocked' ? 'Bấm để nghe radio'
    : playing ? 'Đang phát trực tiếp' : status === 'loading' ? 'Đang tải nhạc…'
    : enabled && !active ? 'Tạm dừng' : 'Âm thanh đang tắt';

  return (
    <aside className="prr-music" aria-label="Radio BXH" data-playing={playing}>
      <audio ref={audioRef} src={shown.src} preload="none"
        onLoadedMetadata={align}
        onPlaying={() => { setPlaying(true); setStatus('playing'); align(); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => { setPlaying(false); setStatus('loading'); }}
        onTimeUpdate={handleTimeUpdate}
        onError={() => { ++playAttempt.current; setPlaying(false); setStatus('error'); }}
        onEnded={handleEnded} />
      <span className="prr-music-disc" aria-hidden="true"><span><Music2 size={15} /></span></span>
      <div className="prr-music-copy">
        <strong title={shown.title}>{shown.title}</strong>
        <span role="status" className="prr-music-status">
          {playing && <i className="prr-music-live" aria-hidden="true" />}{description}
        </span>
      </div>
      {canControl && <button type="button" className="prr-music-toggle prr-music-step" onClick={() => step(-1)}
        aria-label="Bài trước" title="Bài trước (Dev)"><SkipBack size={17} aria-hidden="true" /></button>}
      <button type="button" className="prr-music-toggle" onClick={toggleSound}
        aria-label={label} title={label} aria-pressed={soundOn}>
        {soundOn ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
      </button>
      {canControl && <button type="button" className="prr-music-toggle prr-music-step" onClick={() => step(1)}
        aria-label="Bài tiếp theo" title="Bài tiếp theo (Dev)"><SkipForward size={17} aria-hidden="true" /></button>}
      {onManage && <button type="button" className="prr-music-toggle" onClick={onManage}
        aria-label="Điều khiển radio" title="Điều khiển radio (Dev)"><Settings2 size={17} aria-hidden="true" /></button>}
      <span className="prr-music-progress" aria-hidden="true"><span ref={progressRef} /></span>
    </aside>
  );
}
