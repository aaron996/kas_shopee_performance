import React from 'react';
import { Music2, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { radioDescription, radioToggleLabel, useRadio } from './radioContext.js';
import './rankingMusic.css';

// The radio docked inside the BXH stage. Playback itself lives in RadioProvider,
// so leaving this tab keeps the music going (see RadioFloatingLayer).
export default function RankingMusicWidget() {
  const radio = useRadio();
  if (!radio?.ready) return null;
  const { track, playing, status, soundEnabled, soundOn, toggleSound, canControl, step, openManager } = radio;
  const label = radioToggleLabel({ status, soundOn });

  return (
    <aside className="prr-music" aria-label="Radio BXH" data-playing={playing}>
      <span className="prr-music-disc" aria-hidden="true"><span><Music2 size={15} /></span></span>
      <div className="prr-music-copy">
        <strong title={track.title}>{track.title}</strong>
        <span role="status" className="prr-music-status">
          {playing && <i className="prr-music-live" aria-hidden="true" />}{radioDescription({ status, playing, soundEnabled })}
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
      {openManager && <button type="button" className="prr-music-toggle" onClick={openManager}
        aria-label="Điều khiển radio" title="Điều khiển radio (Dev)"><Settings2 size={17} aria-hidden="true" /></button>}
      <span className="prr-music-progress" aria-hidden="true"><span /></span>
    </aside>
  );
}
