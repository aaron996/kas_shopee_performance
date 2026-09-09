import React, { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import './mascot.css';

// One transparent illustration and a fixed bottom-center pivot. Motion is CSS-only
// so request-state loops stay smooth while the browser is parsing streamed output.
export default function Mascot({ state = 'idle', active = false }) {
  const [failed, setFailed] = useState(false);

  return <span className={`kas-mascot${active ? ' kas-mascot--active' : ''}`} data-state={state} aria-hidden="true">
    {failed ? <MessageSquareText size={28} /> : <img
      src="/mascot/kas-parcel.png" alt="" width="1280" height="1280"
      draggable="false" onError={() => setFailed(true)} />}
  </span>;
}
