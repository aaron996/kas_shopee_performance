import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabaseClient.js';
import { resolveRadio } from '../../utils/radioSchedule.js';

export const MUSIC_BUCKET = 'ranking-music';
const TABLE = 'ranking_music_tracks';
const POLL_MS = 15000;

export function trackUrl(filePath) {
  return supabase.storage.from(MUSIC_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

function toTracks(rows) {
  return (rows || [])
    .filter(row => row?.id && row.title && row.file_path)
    .map(row => ({ id: row.id, title: row.title, src: trackUrl(row.file_path), duration: Number(row.duration_seconds) || 0 }));
}

async function fetchRadio() {
  const startedAt = Date.now();
  const [tracksResult, radioResult] = await Promise.all([
    supabase.from(TABLE).select('id,title,file_path,duration_seconds').eq('active', true)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.rpc('get_ranking_radio')
  ]);
  const finishedAt = Date.now();
  if (tracksResult.error) throw tracksResult.error;
  if (radioResult.error) throw radioResult.error;
  const radio = radioResult.data;
  return {
    tracks: toTracks(tracksResult.data),
    anchor: radio ? { trackId: radio.track_id, startedAtMs: Number(radio.started_at_ms) } : null,
    // Server clock minus the local clock at the midpoint of the round trip.
    offsetMs: radio ? Number(radio.server_now_ms) - (startedAt + finishedAt) / 2 : 0
  };
}

// Shared radio state: the active playlist, the shared anchor and a server-corrected clock.
// Listeners poll; only devs can move the anchor (RPC is guarded by is_dev_admin()).
export function useRankingRadio() {
  const [state, setState] = useState({ ready: false, tracks: [], anchor: null, offsetMs: 0 });
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRadio();
      setState({ ready: true, ...next });
      return next;
    } catch {
      // Keep the last good state; before the first success the widget falls back to the bundled track.
      setState(previous => (previous.ready ? previous : { ...previous, ready: true }));
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const now = useCallback(() => Date.now() + stateRef.current.offsetMs, []);

  const play = useCallback(async (trackId, offsetSeconds = 0) => {
    const { error } = await supabase.rpc('dev_ranking_radio_play', { p_track_id: trackId, p_offset_seconds: offsetSeconds });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  // Where the radio is right now, captured before a playlist edit.
  const snapshot = useCallback(() => {
    const current = stateRef.current;
    const resolved = resolveRadio(current.anchor, current.tracks, now());
    return resolved
      ? { trackId: resolved.track.id, offset: resolved.offset, index: resolved.index, capturedAtMs: now() }
      : null;
  }, [now]);

  // After a playlist edit, re-anchor so listeners keep (roughly) the same track and position.
  const reanchor = useCallback(async before => {
    const fresh = await refresh();
    if (!before || !fresh) return;
    const list = fresh.tracks.filter(track => track.duration > 0);
    if (!list.length) return;
    const kept = list.find(track => track.id === before.trackId);
    const target = kept || list[Math.min(before.index, list.length - 1)];
    // Account for the time the edit itself took, without running past the end of the track.
    const elapsed = Math.max(0, (now() - before.capturedAtMs) / 1000);
    await play(target.id, kept ? Math.min(before.offset + elapsed, Math.max(0, kept.duration - 1)) : 0);
  }, [refresh, play, now]);

  return { ...state, now, refresh, play, snapshot, reanchor };
}
