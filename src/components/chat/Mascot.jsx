import React, { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import './mascot.css';

const SPRITE_BY_STATE = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  searching: 'thinking',
  result: 'result',
  error: 'idle'
};

// Each request phase uses its own four-frame transparent sprite sequence. CSS
// steps keeps the animation independent of streamed text and off the JS thread.
export default function Mascot({ state = 'idle', active = false }) {
  const [failed, setFailed] = useState(false);
  const sprite = SPRITE_BY_STATE[state] || 'idle';

  return <span className={`kas-mascot${active ? ' kas-mascot--active' : ''}`} data-state={state} aria-hidden="true">
    {failed ? <MessageSquareText size={28} /> : <span className={`kas-mascot-sprite kas-mascot-sprite--${sprite}`}>
      <img key={state} src={`/mascot/animation/kas-parcel-${sprite}-sprite.png`} alt=""
        draggable="false" onError={() => setFailed(true)} />
    </span>}
  </span>;
}
