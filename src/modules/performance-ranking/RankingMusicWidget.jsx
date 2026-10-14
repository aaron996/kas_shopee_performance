import React, { useEffect, useId, useRef, useState } from 'react';
import { Palette, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { DISC_STYLES, radioDescription, radioToggleLabel, useRadio } from './radioContext.js';
import MusicDisc from './MusicDisc.jsx';
import './rankingMusic.css';

const SHAPE_KEY = 'ghn-ranking-radio-disc';
function readShape() {
  try { const saved = localStorage.getItem(SHAPE_KEY); return DISC_STYLES.some(s => s.id === saved) ? saved : 'vinyl'; }
  catch { return 'vinyl'; }
}

export default function RankingMusicWidget() {
  const radio = useRadio();
  const { ready, playing, soundOn, volume, getAnalyser } = radio || {};
  const root = useRef(null);
  const discButton = useRef(null);
  const waves = useRef(null);
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState(null);
  const [shape, setShape] = useState(readShape);
  const expanded = hovered || focused || pinned || Boolean(panel);

  useEffect(() => {
    const element = root.current;
    const surface = element?.parentElement;
    if (!ready || !surface) return undefined;
    const fit = () => {
      const available = surface.getBoundingClientRect().right - element.getBoundingClientRect().left - 6;
      element.style.setProperty('--dock-width', `${Math.min(360, available)}px`);
      element.style.setProperty('--dock-panel-width', `${Math.min(300, available)}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const dismiss = event => {
      if (!root.current?.contains(event.target)) { setPanel(null); setPinned(false); }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  // Read real frequency energy directly into two rings, without React frame updates.
  useEffect(() => {
    const rings = waves.current?.children;
    if (!rings) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const samples = new Uint8Array(128);
    let frame = 0, previous = 0, energy = 0;
    const reset = () => { for (const ring of rings) { ring.style.opacity = '0'; ring.style.transform = 'scale(1)'; } };
    const draw = now => {
      if (!reduce.matches && !document.hidden && now - previous >= 33) {
        previous = now;
        const analyser = getAnalyser?.();
        if (analyser && playing && soundOn && volume > 0) {
          analyser.getByteFrequencyData(samples);
          let bass = 0;
          for (let i = 1; i < 18; i++) bass += samples[i];
          energy += (bass / (17 * 255) - energy) * .35;
          for (let i = 0; i < rings.length; i++) {
            rings[i].style.transform = `scale(${1 + energy * (.35 + i * .3)})`;
            rings[i].style.opacity = String(energy * (.65 - i * .2));
          }
        } else reset();
      } else if (reduce.matches || document.hidden) reset();
      frame = requestAnimationFrame(draw);
    };
    if (playing && soundOn) frame = requestAnimationFrame(draw);
    else reset();
    return () => { cancelAnimationFrame(frame); reset(); };
  }, [ready, playing, soundOn, volume, getAnalyser]);

  if (!radio?.ready) return null;
  const { track, status, soundEnabled, toggleSound, setVolume, openManager } = radio;
  const label = radioToggleLabel({ status, soundOn });
  function chooseShape(next) {
    setShape(next);
    try { localStorage.setItem(SHAPE_KEY, next); } catch { /* Optional preference. */ }
  }
  function close() { setPanel(null); setPinned(false); discButton.current?.focus(); setFocused(false); setHovered(false); }

  return <aside ref={root} className="prr-music prr-music--dock" aria-label="Radio BXH"
    data-playing={playing && soundOn && volume > 0} data-expanded={expanded}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocus={event => { if (event.target.matches(':focus-visible')) setFocused(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <span ref={waves} className="prr-music-waves" aria-hidden="true"><i /><i /></span>
    <button ref={discButton} type="button" className="prr-music-disc-trigger"
      aria-label={`${expanded ? 'Thu gọn' : 'Mở'} trình phát nhạc · ${track.title}`}
      aria-expanded={expanded} aria-controls={`${id}-controls`}
      onClick={() => { radio.prepareAnalysis?.(); setPinned(!pinned); setPanel(null); }}>
      <MusicDisc shape={shape} />
      {(status === 'blocked' || status === 'error' || !soundOn || volume === 0) && <span className="prr-music-disc-badge"><VolumeX size={11} /></span>}
    </button>
    <div id={`${id}-controls`} className="prr-music-toolbar" inert={!expanded}>
      <div className="prr-music-copy">
        <strong title={track.title}>{track.title}</strong>
        <span role="status" className="prr-music-status">{radioDescription({ status, playing, soundEnabled })}</span>
      </div>
      <button type="button" className="prr-music-toggle" onClick={() => { toggleSound(); setPanel('volume'); }}
        aria-label={`${label} và chỉnh âm lượng`} title={`${label} · chỉnh âm lượng`}
        aria-expanded={panel === 'volume'} aria-controls={`${id}-volume`}>
        {soundOn && volume > 0 ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      <button type="button" className="prr-music-toggle" onClick={() => setPanel(panel === 'shape' ? null : 'shape')}
        aria-label="Chọn kiểu đĩa" title="Chọn kiểu đĩa" aria-expanded={panel === 'shape'} aria-controls={`${id}-shape`}><Palette size={18} /></button>
      {openManager && <button type="button" className="prr-music-toggle" onClick={openManager}
        aria-label="Điều khiển radio" title="Điều khiển radio (Dev)"><Settings2 size={17} /></button>}
    </div>
    <div className="prr-music-panel" data-open={Boolean(panel)} inert={!panel}>
      <div className="prr-music-panel-head"><strong>{panel === 'shape' ? 'Kiểu đĩa' : 'Âm lượng'}</strong>
        <button type="button" className="prr-music-toggle" aria-label="Đóng tùy chỉnh nhạc" onClick={close}><X size={16} /></button></div>
      {panel === 'volume' && <div id={`${id}-volume`} className="prr-music-volume">
        <button type="button" className="prr-music-toggle" onClick={toggleSound} aria-label={label} aria-pressed={soundOn}>
          {soundOn && volume > 0 ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
        <input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)}
          aria-label="Âm lượng radio" aria-valuetext={`${Math.round(volume * 100)} phần trăm`}
          onChange={event => setVolume(Number(event.target.value) / 100)} />
        <output>{Math.round(volume * 100)}%</output>
      </div>}
      {panel === 'shape' && <fieldset id={`${id}-shape`} className="prr-music-shapes"><legend className="sr-only">Chọn kiểu đĩa</legend>
        {DISC_STYLES.map(option => <label key={option.id} data-selected={shape === option.id}>
          <input type="radio" name={`${id}-disc`} checked={shape === option.id} onChange={() => chooseShape(option.id)} />
          <MusicDisc shape={option.id} /><span>{option.label}</span>
        </label>)}
      </fieldset>}
    </div>
  </aside>;
}
