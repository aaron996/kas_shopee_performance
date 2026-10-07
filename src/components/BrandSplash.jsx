import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './BrandSplash.css';

/**
 * Full-screen brand intro shown while the first data sync of a session runs
 * (the 10–15s wait in App.jsx). Plays public/brand-intro.* — a 10s motion piece
 * rendered from tools/brand-video/scene.html. Seconds 8–10 are a seamless 2s
 * idle loop, so when the data takes longer than the intro we keep looping that
 * tail instead of freezing on the last frame.
 *
 *  - It is the FIRST thing painted: App mounts it in the very first render
 *    (the signed-in user is restored synchronously from localStorage), as an
 *    opaque white layer above the app, so the dashboard never shows through.
 *  - `ready` flips true when the first LIVE sync has settled (a cache restore does
 *    not count — the intro exists to cover the wait for fresh data). The splash
 *    then fades out (400ms), but never before MIN_SHOW_MS so a fast sync does not
 *    flash the video.
 *  - "Bỏ qua" appears only after the live sync finishes, and skips the remaining
 *    video time. onComplete runs after the fade, before client onboarding opens.
 *  - prefers-reduced-motion, or a blocked/failed autoplay, shows the static
 *    logo instead of the video.
 */
export const LOOP_START = 8;
export const LOOP_END = 10;
const LEAVE_MS = 400;
const MIN_SHOW_MS = 10000;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default function BrandSplash({ ready, canSkip = ready, onComplete }) {
  const [phase, setPhase] = useState('show');
  const [useStatic, setUseStatic] = useState(prefersReducedMotion);
  const [minElapsed, setMinElapsed] = useState(false);
  const skipVisible = ready && canSkip && phase === 'show';
  const videoRef = useRef(null);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    return () => clearTimeout(minTimer);
  }, []);

  useEffect(() => {
    if (phase !== 'show' || !ready || !minElapsed) return undefined;
    setPhase('leaving');
    return undefined;
  }, [phase, ready, minElapsed]);

  useEffect(() => {
    if (phase !== 'leaving') return undefined;
    const timer = setTimeout(() => setPhase('gone'), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'gone') onComplete?.();
  }, [phase, onComplete]);

  // Keep the idle tail looping until the splash leaves.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || useStatic || phase === 'gone') return undefined;
    let raf = 0;
    const tick = () => {
      if (video.currentTime >= LOOP_END - 0.03) video.currentTime = LOOP_START;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onEnded = () => {
      video.currentTime = LOOP_START;
      video.play().catch(() => setUseStatic(true));
    };
    video.addEventListener('ended', onEnded);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('ended', onEnded);
    };
  }, [phase, useStatic]);

  if (phase === 'gone') return null;

  // Escape every app stacking/transform context, including mobile shells.
  return createPortal(
    <div
      className={`brand-splash${phase === 'leaving' ? ' brand-splash--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!ready}
      aria-label="Đang tải dữ liệu"
    >
      {useStatic ? (
        <img className="brand-splash__media" src="/ghn-performance-logo.svg" alt="" aria-hidden="true" />
      ) : (
        <video
          ref={videoRef}
          className="brand-splash__media"
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          onError={() => setUseStatic(true)}
          onLoadedMetadata={(e) => e.currentTarget.play().catch(() => setUseStatic(true))}
        >
          <source src="/brand-intro.mp4" type="video/mp4" />
          <source src="/brand-intro.webm" type="video/webm" />
        </video>
      )}
      {skipVisible && (
        <button
          type="button"
          className="brand-splash__skip brand-splash__skip--visible"
          onClick={() => setPhase('leaving')}
        >
          Bỏ qua <span aria-hidden="true">→</span>
        </button>
      )}
    </div>, document.body
  );
}
