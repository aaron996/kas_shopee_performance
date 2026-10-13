import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Music2, Truck, Volume2, VolumeX } from 'lucide-react';
import { gsap, shouldAnimate } from '../../utils/gsapSetup';
import { radioDescription, radioToggleLabel, useRadio } from './radioContext.js';
import './rankingMusic.css';

const POSITION_KEY = 'ghn-ranking-radio-position';
const EDGE = 8;
const KEY_STEP = 24;

function readPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
    return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? saved : null;
  } catch { return null; }
}

function savePosition(position) {
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* Storage is optional. */ }
}

function clampPosition(position, element) {
  const width = element?.offsetWidth || 280;
  const height = element?.offsetHeight || 60;
  return {
    x: Math.min(Math.max(EDGE, position.x), Math.max(EDGE, window.innerWidth - width - EDGE)),
    y: Math.min(Math.max(EDGE, position.y), Math.max(EDGE, window.innerHeight - height - EDGE))
  };
}

// Bottom-left, clear of the desktop sidebar and the mobile bottom nav.
function defaultPosition(element) {
  const mobile = window.innerWidth <= 768;
  const height = element?.offsetHeight || 60;
  return clampPosition({ x: mobile ? 12 : 250 + 20, y: window.innerHeight - height - (mobile ? 64 + 12 : 20) }, element);
}

// The radio keeps playing when the listener leaves the BXH tab. It then lives here as a small
// pill that can be dragged anywhere; the BXH stage "collapses" into it the first time.
export default function RadioFloatingLayer({ activeTab, suppressed = false }) {
  const radio = useRadio();
  const widgetRef = useRef(null);
  const ghostRef = useRef(null);
  const dragRef = useRef(null);
  const previousTab = useRef(activeTab);
  const collapsePending = useRef(false);
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [eligible, setEligible] = useState(false);

  // Only listeners who left BXH with sound on get the widget (nothing is playing for muted ones to keep).
  // Muting from the widget keeps it on screen so they can turn the radio back on.
  const show = Boolean(radio?.ready && eligible && activeTab !== 'ranking' && !suppressed);

  useLayoutEffect(() => {
    if (!show || !widgetRef.current) return;
    setPosition(previous => clampPosition(previous || readPosition() || defaultPosition(widgetRef.current), widgetRef.current));
  }, [show]);

  // Remember that the listener just left the BXH stage; the animation waits until the widget is placed.
  useLayoutEffect(() => {
    if (activeTab === 'ranking') {
      collapsePending.current = false;
      setEligible(false);
    } else if (previousTab.current === 'ranking') {
      collapsePending.current = true;
      setEligible(Boolean(radio?.soundEnabled));
    }
    previousTab.current = activeTab;
    // Only the tab change matters here; the sound preference is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Collapse animation: a ghost of the BXH stage shrinks into the widget, which then pops in.
  useLayoutEffect(() => {
    const widget = widgetRef.current;
    const ghost = ghostRef.current;
    if (!show || !collapsePending.current || !widget || !ghost || !position) return undefined;
    collapsePending.current = false;
    if (!shouldAnimate()) return undefined;
    const target = widget.getBoundingClientRect();
    gsap.set(widget, { opacity: 0, scale: 0.6, transformOrigin: 'center' });
    gsap.set(ghost, { display: 'grid', left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0, opacity: 1 });
    gsap.set(ghost.firstChild, { opacity: 1 });
    const timeline = gsap.timeline({ onComplete: () => gsap.set(ghost, { display: 'none' }) });
    timeline
      .to(ghost.firstChild, { opacity: 0, duration: 0.22, ease: 'power2.out' }, 0)
      .to(ghost, { left: target.left, top: target.top, width: target.width, height: target.height, borderRadius: target.height / 2, duration: 0.6, ease: 'power3.inOut' }, 0)
      .to(widget, { opacity: 1, scale: 1, duration: 0.32, ease: 'back.out(1.7)', clearProps: 'opacity,transform' }, 0.46)
      .to(ghost, { opacity: 0, duration: 0.2, ease: 'power1.out' }, 0.5);
    return () => { timeline.kill(); gsap.set(ghost, { display: 'none' }); gsap.set(widget, { clearProps: 'opacity,transform' }); };
    // Runs on the tab change that made the widget appear, not on later drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, show, Boolean(position)]);

  useEffect(() => {
    if (!show) return undefined;
    const onResize = () => setPosition(previous => (previous ? clampPosition(previous, widgetRef.current) : previous));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [show]);

  const onPointerDown = useCallback(event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position };
    setDragging(true);
  }, [position]);

  const onPointerMove = useCallback(event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY }, widgetRef.current));
  }, []);

  const endDrag = useCallback(event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setPosition(current => { if (current) savePosition(current); return current; });
  }, []);

  const onKeyDown = useCallback(event => {
    const delta = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[event.key];
    if (!delta || event.target !== event.currentTarget) return;
    event.preventDefault();
    setPosition(previous => {
      const next = clampPosition({ x: previous.x + delta[0], y: previous.y + delta[1] }, widgetRef.current);
      savePosition(next);
      return next;
    });
  }, []);

  if (!radio) return null;
  const { track, playing, status, soundEnabled, soundOn, toggleSound } = radio;
  const label = radioToggleLabel({ status, soundOn });

  return (
    <>
      <div ref={ghostRef} className="prr-radio-ghost" aria-hidden="true">
        <span><Truck size={28} />BXH Performance</span>
      </div>
      {show && (
        <aside ref={widgetRef} className="prr-music prr-music--floating" data-playing={playing} data-dragging={dragging}
          aria-label="Radio BXH. Kéo để di chuyển, hoặc dùng phím mũi tên" tabIndex={0}
          style={position ? { left: position.x, top: position.y } : { visibility: 'hidden' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          onKeyDown={onKeyDown}>
          <span className="prr-music-disc" aria-hidden="true"><span><Music2 size={15} /></span></span>
          <div className="prr-music-copy">
            <strong title={track.title}>{track.title}</strong>
            <span role="status" className="prr-music-status">
              {playing && <i className="prr-music-live" aria-hidden="true" />}{radioDescription({ status, playing, soundEnabled })}
            </span>
          </div>
          <button type="button" className="prr-music-toggle" onClick={toggleSound}
            aria-label={label} title={label} aria-pressed={soundOn}>
            {soundOn ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
          </button>
          <span className="prr-music-progress" aria-hidden="true"><span /></span>
        </aside>
      )}
    </>
  );
}
