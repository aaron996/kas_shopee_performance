// Pure radio schedule: the same anchor, playlist and server time give every listener the same track and offset.

export function playableTracks(tracks) {
  return (tracks || []).filter(track => track?.id && track.src && Number(track.duration) > 0);
}

// anchor: { trackId, startedAtMs }; nowMs must already be server-corrected.
export function resolveRadio(anchor, tracks, nowMs) {
  const list = playableTracks(tracks);
  if (!list.length || !anchor) return null;
  const total = list.reduce((sum, track) => sum + Number(track.duration), 0);
  let index = Math.max(0, list.findIndex(track => track.id === anchor.trackId));
  let elapsed = Math.max(0, (nowMs - anchor.startedAtMs) / 1000) % total;
  // The loop terminates: elapsed < total, so at most one full cycle is walked.
  while (elapsed >= Number(list[index].duration)) {
    elapsed -= Number(list[index].duration);
    index = (index + 1) % list.length;
  }
  return { index, track: list[index], offset: elapsed, list };
}

export function neighbourTrack(list, index, delta) {
  if (!list?.length) return null;
  return list[(index + delta + list.length * Math.abs(delta)) % list.length];
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// Shuffle only scheduled songs; disabled / unmeasured rows keep their slots.
export function shuffleRadioTracks(tracks, random = Math.random) {
  const eligible = tracks.filter(track => track.active && Number(track.duration_seconds) > 0);
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  let index = 0;
  return tracks.map(track => track.active && Number(track.duration_seconds) > 0 ? eligible[index++] : track);
}
