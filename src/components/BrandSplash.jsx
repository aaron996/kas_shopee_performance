import React, { useEffect, useRef, useState } from 'react';
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
 *  - `ready` flips true when data is on screen (cache restore or live sync):
 *    the splash fades out (400ms). With a cache hit that is ~100ms, so it reads
 *    as a soft fade-in of the app rather than a video.
 *  - prefers-reduced-motion, or a blocked/failed autoplay, shows the static
 *    logo instead of the video.
 */
export const LOOP_START = 8;
export const LOOP_END = 10;
const LEAVE_MS = 400;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default function BrandSplash({ ready }) {
  // show → (ready) → leaving → gone.  Already-ready at mount (e.g. local preview) skips it.
  const [phase, setPhase] = useState(ready ? 'gone' : 'show');
  const [useStatic, setUseStatic] = useState(prefersReducedMotion);
  const videoRef = useRef(null);

  useEffect(() => {
    if (phase !== 'show' || !ready) return undefined;
    setPhase('leaving');
    return undefined;
  }, [phase, ready]);

  useEffect(() => {
    if (phase !== 'leaving') return undefined;
    const timer = setTimeout(() => setPhase('gone'), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

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

  return (
    <div
      className={`brand-splash${phase === 'leaving' ? ' brand-splash--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
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
    </div>
  );
}
