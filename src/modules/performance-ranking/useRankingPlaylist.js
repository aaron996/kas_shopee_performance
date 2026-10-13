import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient.js';
import { RANKING_PLAYLIST } from './rankingPlaylist.js';

export const MUSIC_BUCKET = 'ranking-music';

// Remote list is fetched once per page load; any failure or empty list falls back to the bundled track.
let remoteRequest = null;

export function trackUrl(filePath) {
  return supabase.storage.from(MUSIC_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

export function toPlaylist(rows, resolveUrl = trackUrl) {
  return (rows || [])
    .filter(row => row?.id && row.title && row.file_path)
    .map(row => ({ id: row.id, title: row.title, src: resolveUrl(row.file_path) }));
}

function loadRemotePlaylist() {
  if (!remoteRequest) {
    remoteRequest = supabase
      .from('ranking_music_tracks')
      .select('id,title,file_path')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return toPlaylist(data);
      })
      .catch(() => {
        remoteRequest = null; // let a later mount retry
        return [];
      });
  }
  return remoteRequest;
}

// Called after a dev edits the playlist so the next mount reads fresh data.
export function invalidateRankingPlaylist() {
  remoteRequest = null;
}

// `version` lets the widget reload after a dev edit.
export function useRankingPlaylist(version = 0) {
  const [state, setState] = useState({ ready: false, playlist: RANKING_PLAYLIST });

  useEffect(() => {
    let cancelled = false;
    loadRemotePlaylist().then(remote => {
      if (cancelled) return;
      setState({ ready: true, playlist: remote.length ? remote : RANKING_PLAYLIST });
    });
    return () => { cancelled = true; };
  }, [version]);

  return state;
}
