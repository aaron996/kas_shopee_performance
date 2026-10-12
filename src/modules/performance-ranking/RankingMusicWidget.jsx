import React, { useEffect, useRef, useState } from 'react';
import { Music2, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { RANKING_PLAYLIST } from './rankingPlaylist.js';
import './rankingMusic.css';

const PREFERENCE_KEY = 'ghn-ranking-music-enabled';

function readPreference() {
  try { return localStorage.getItem(PREFERENCE_KEY) === 'true'; }
  catch { return false; }
}

export default function RankingMusicWidget({ active = true, playlist = RANKING_PLAYLIST }) {
  const audioRef = useRef(null);
  const playAttempt = useRef(0);
  const [enabled, setEnabled] = useState(readPreference);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('idle');
  const [visible, setVisible] = useState(() => !document.hidden);
  const track = playlist[trackIndex % (playlist.length || 1)];
  const canPlay = active && visible && enabled;

  function startAudio() {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const attempt = ++playAttempt.current;
    setStatus('loading');
    audio.volume = 0.3;
    audio.play().catch(error => {
      if (attempt !== playAttempt.current) return;
      setPlaying(false);
      setStatus(error.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCE_KEY, String(enabled)); } catch { /* Storage is optional. */ }
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    const invalidateAttempt = () => { ++playAttempt.current; };
    if (!audio || !track) return;
    if (canPlay) startAudio();
    else {
      ++playAttempt.current;
      audio.pause();
      setPlaying(false);
      setStatus('idle');
    }
    return () => {
      invalidateAttempt();
      audio.pause();
    };
    // Playback follows scope, visibility, preference and the actual source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, track?.src]);

  function toggleSound() {
    if (!enabled || status === 'blocked' || status === 'error') {
      setEnabled(true);
      // Keep play() inside the click gesture for browsers that block autoplay.
      if (active && visible) startAudio();
    } else {
      ++playAttempt.current;
      audioRef.current?.pause();
      setPlaying(false);
      setStatus('idle');
      setEnabled(false);
    }
  }

  if (!track) return null;
  const needsRetry = status === 'blocked' || status === 'error';
  const soundOn = enabled && !needsRetry;
  const label = status === 'error' ? 'Thử phát lại nhạc nền' : soundOn ? 'Tắt nhạc nền' : 'Bật nhạc nền';
  const description = status === 'error' ? 'Không tải được nhạc · Bấm để thử lại'
    : status === 'blocked' ? 'Bấm để phát nhạc'
    : playing ? 'Đang phát' : status === 'loading' ? 'Đang tải nhạc…'
    : enabled && (!active || !visible) ? 'Tạm dừng' : 'Âm thanh đang tắt';

  return (
    <aside className="prr-music" aria-label="Nhạc nền BXH" data-playing={playing}>
      <audio ref={audioRef} src={track.src} preload="none"
        onPlaying={() => { setPlaying(true); setStatus('playing'); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => { setPlaying(false); setStatus('loading'); }}
        onError={() => { ++playAttempt.current; setPlaying(false); setStatus('error'); }}
        onEnded={() => {
          setPlaying(false);
          if (playlist.length > 1) setTrackIndex(index => (index + 1) % playlist.length);
          else if (canPlay) { audioRef.current.currentTime = 0; startAudio(); }
        }} />
      <span className="prr-music-disc" aria-hidden="true"><span><Music2 size={15} /></span></span>
      <div className="prr-music-copy">
        <strong title={track.title}>{track.title}</strong>
        <span role="status">{description}</span>
      </div>
      <button type="button" className="prr-music-toggle" onClick={toggleSound}
        aria-label={label} title={label} aria-pressed={soundOn}>
        {soundOn ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
      </button>
      {playlist.length > 1 && <button type="button" className="prr-music-toggle"
        onClick={() => setTrackIndex(index => (index + 1) % playlist.length)}
        aria-label="Bài tiếp theo" title="Bài tiếp theo"><SkipForward size={17} aria-hidden="true" /></button>}
    </aside>
  );
}
