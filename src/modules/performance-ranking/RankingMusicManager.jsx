import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Play, Shuffle, SkipBack, SkipForward, Trash2, Upload, X } from 'lucide-react';
import ModalDialog from '../../components/ui/ModalDialog.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { supabase } from '../../utils/supabaseClient.js';
import { formatClock, neighbourTrack, resolveRadio, shuffleRadioTracks } from '../../utils/radioSchedule.js';
import { audioContentType, storagePathFor, titleFromFileName, validateAudioFile } from '../../utils/rankingMusicFiles.js';
import { MUSIC_BUCKET, trackUrl } from './useRankingRadio.js';

const TABLE = 'ranking_music_tracks';

// Browsers decode the header; no server work and the value matches what listeners will hear.
function readDuration(src) {
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    const timer = window.setTimeout(() => done(new Error('Không đọc được thời lượng.')), 10000);
    function done(error, value) {
      window.clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      if (error) reject(error); else resolve(value);
    }
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => (Number.isFinite(probe.duration) && probe.duration > 0
      ? done(null, probe.duration) : done(new Error('Không đọc được thời lượng.')));
    probe.onerror = () => done(new Error('File âm thanh không hợp lệ.'));
    probe.src = src;
  });
}

async function fileDuration(file) {
  const url = URL.createObjectURL(file);
  try { return await readDuration(url); }
  finally { URL.revokeObjectURL(url); }
}

function EqualizerIcon() {
  return <span className="prr-mm-eq" aria-hidden="true"><i /><i /><i /></span>;
}

// Dev-only radio console. Authorization is enforced by RLS and the dev_ranking_radio_play RPC
// (public.is_dev_admin()); hiding the entry point in the widget is only a convenience.
export default function RankingMusicManager({ isOpen, onClose, radio }) {
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const measuredRef = useRef(new Set());
  const measuringRef = useRef(false);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [fileOver, setFileOver] = useState(false);
  const [, setClock] = useState(0);

  const resolved = resolveRadio(radio.anchor, radio.tracks, radio.now());

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setInterval(() => setClock(n => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLE).select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setLoading(false);
    if (error) { showToast(`Không tải được danh sách nhạc: ${error.message}`, { tone: 'error' }); return null; }
    setTracks(data || []);
    return data || [];
  }, [showToast]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  // Older rows were added without a duration; measure them once so the radio can schedule them.
  const { reanchor, snapshot } = radio;
  useEffect(() => {
    if (measuringRef.current) return;
    const missing = tracks.filter(track => !track.duration_seconds && !measuredRef.current.has(track.id));
    if (!missing.length) return;
    measuringRef.current = true;
    (async () => {
      let changed = false;
      try {
        for (const track of missing) {
          measuredRef.current.add(track.id);
          try {
            const seconds = await readDuration(trackUrl(track.file_path));
            const { error } = await supabase.from(TABLE).update({ duration_seconds: Math.round(seconds * 1000) / 1000 }).eq('id', track.id);
            if (!error) changed = true;
          } catch { /* Leave it unscheduled; the row shows a pending marker. */ }
        }
      } finally {
        measuringRef.current = false;
      }
      if (changed) { await load(); await reanchor(snapshot()); }
    })();
  }, [tracks, load, reanchor, snapshot]);

  // Playlist edits re-anchor the radio so listeners keep roughly the same track and position.
  async function mutate(action, { success, reanchor = true } = {}) {
    if (busy) return;
    setBusy(true);
    const before = reanchor ? radio.snapshot() : null;
    try {
      await action();
      await load();
      if (reanchor) await radio.reanchor(before); else await radio.refresh();
      if (success) showToast(success, { tone: 'success' });
    } catch (error) {
      showToast(error.message || 'Thao tác thất bại.', { tone: 'error' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function play(trackId) {
    if (busy) return;
    setBusy(true);
    try { await radio.play(trackId); }
    catch (error) { showToast(error.message || 'Không đổi được bài.', { tone: 'error' }); }
    finally { setBusy(false); }
  }

  function step(delta) {
    const target = resolved && neighbourTrack(resolved.list, resolved.index, delta);
    if (target) play(target.id);
  }

  function patch(track, values, options) {
    return mutate(async () => {
      const { error } = await supabase.from(TABLE).update(values).eq('id', track.id);
      if (error) throw error;
    }, options);
  }

  function rename(track, title) {
    const next = title.trim();
    if (!next || next === track.title) return;
    patch(track, { title: next }, { reanchor: false });
  }

  function persistOrder(reordered, options) {
    setTracks(reordered);
    mutate(async () => {
      const changed = reordered.map((track, order) => ({ track, order })).filter(({ track, order }) => track.sort_order !== order);
      const results = await Promise.all(changed.map(({ track, order }) =>
        supabase.from(TABLE).update({ sort_order: order }).eq('id', track.id)));
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;
    }, options);
  }

  function moveBy(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const reordered = [...tracks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    persistOrder(reordered);
  }

  function dropOn(targetId) {
    const from = tracks.findIndex(track => track.id === dragId);
    const to = tracks.findIndex(track => track.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const reordered = [...tracks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    persistOrder(reordered);
  }

  function remove(track) {
    mutate(async () => {
      const { error } = await supabase.from(TABLE).delete().eq('id', track.id);
      if (error) throw error;
      setConfirmId(null);
      const { error: storageError } = await supabase.storage.from(MUSIC_BUCKET).remove([track.file_path]);
      if (storageError) showToast('Đã xóa bài nhưng chưa xóa được file trong kho lưu trữ.', { tone: 'warning' });
    }, { success: 'Đã xóa bài.' });
  }

  function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length || busy) return;
    const items = files.map((file, index) => ({ key: `${Date.now()}-${index}`, name: file.name, state: 'waiting', note: '' }));
    setUploads(items);
    const mark = (key, state, note = '') => setUploads(previous => previous.map(item => (item.key === key ? { ...item, state, note } : item)));
    mutate(async () => {
      let sortOrder = tracks.reduce((max, track) => Math.max(max, track.sort_order), -1) + 1;
      let added = 0;
      for (const [index, file] of files.entries()) {
        const key = items[index].key;
        const problem = validateAudioFile(file);
        if (problem) { mark(key, 'error', problem); continue; }
        mark(key, 'working');
        let path = null;
        try {
          const seconds = await fileDuration(file);
          path = storagePathFor(file.name);
          const { error: uploadError } = await supabase.storage.from(MUSIC_BUCKET)
            .upload(path, file, { contentType: audioContentType(file.name), upsert: false });
          if (uploadError) throw uploadError;
          const { error: insertError } = await supabase.from(TABLE).insert({
            title: titleFromFileName(file.name), file_path: path, sort_order: sortOrder++,
            duration_seconds: Math.round(seconds * 1000) / 1000
          });
          if (insertError) throw insertError;
          added += 1;
          mark(key, 'done');
        } catch (error) {
          if (path) await supabase.storage.from(MUSIC_BUCKET).remove([path]); // don't leave an orphan file
          mark(key, 'error', error.message || 'Tải lên thất bại.');
        }
      }
      if (!added) throw new Error('Không có bài nào được thêm.');
    }, { success: 'Đã thêm nhạc vào radio.' });
  }

  function onDropFiles(event) {
    event.preventDefault();
    setFileOver(false);
    uploadFiles(event.dataTransfer.files);
  }

  const isFileDrag = event => [...(event.dataTransfer?.types || [])].includes('Files');
  const playingId = resolved?.track.id;

  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} titleId="prr-music-manager-title" className="prr-music-manager">
      <header className="prr-mm-head">
        <h2 id="prr-music-manager-title">Điều khiển radio BXH</h2>
        <button type="button" className="prr-mm-icon" onClick={onClose} aria-label="Đóng"><X size={18} aria-hidden="true" /></button>
      </header>

      <section className="prr-mm-now" aria-label="Đang phát">
        {resolved ? (
          <>
            <div className="prr-mm-now-main">
              <EqualizerIcon />
              <div className="prr-mm-now-copy">
                <strong title={resolved.track.title}>{resolved.track.title}</strong>
                <span>Mọi người đang nghe cùng bài này</span>
              </div>
              <div className="prr-mm-transport">
                <button type="button" className="prr-mm-text" disabled={busy || loading || tracks.filter(t => t.active && t.duration_seconds > 0).length < 2}
                  onClick={() => persistOrder(shuffleRadioTracks(tracks), { success: 'Đã xáo thứ tự bài. Bài đang nghe tiếp tục phát.' })}
                  title="Xáo thứ tự phát cho mọi người, giữ nguyên bài đang nghe"><Shuffle size={17} aria-hidden="true" />Xáo bài</button>
                <button type="button" className="prr-mm-icon" disabled={busy} onClick={() => step(-1)} aria-label="Bài trước"><SkipBack size={17} aria-hidden="true" /></button>
                <button type="button" className="prr-mm-icon" disabled={busy} onClick={() => step(1)} aria-label="Bài tiếp theo"><SkipForward size={17} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="prr-mm-progress" role="progressbar" aria-label="Tiến độ bài đang phát"
              aria-valuemin={0} aria-valuemax={Math.round(resolved.track.duration)} aria-valuenow={Math.round(resolved.offset)}>
              <span style={{ transform: `scaleX(${Math.min(1, resolved.offset / resolved.track.duration)})` }} />
            </div>
            <div className="prr-mm-times"><span>{formatClock(resolved.offset)}</span><span>{formatClock(resolved.track.duration)}</span></div>
          </>
        ) : (
          <p className="prr-mm-note">Chưa có bài nào để phát. Tải nhạc lên bên dưới; khi trống, BXH phát bài mặc định đi kèm ứng dụng.</p>
        )}
      </section>

      <div className="prr-mm-body">
        {loading && tracks.length === 0 && <p className="prr-mm-note">Đang tải…</p>}
        <ol className="prr-mm-list">
          {tracks.map((track, index) => {
            const isPlaying = track.id === playingId;
            return (
              <li key={track.id} className="prr-mm-item" data-playing={isPlaying} data-off={!track.active}
                data-over={overId === track.id && dragId !== track.id}
                onDragOver={event => { if (dragId && !isFileDrag(event)) { event.preventDefault(); setOverId(track.id); } }}
                onDrop={event => { if (dragId) { event.preventDefault(); dropOn(track.id); } }}>
                <button type="button" className="prr-mm-grip" draggable={!busy}
                  aria-label={`Sắp xếp ${track.title}. Alt cộng mũi tên lên hoặc xuống để di chuyển`}
                  onDragStart={event => {
                    setDragId(track.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', track.id);
                    event.dataTransfer.setDragImage(event.currentTarget.closest('li'), 16, 20);
                  }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onKeyDown={event => {
                    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                    event.preventDefault();
                    moveBy(index, event.key === 'ArrowUp' ? -1 : 1);
                  }}>
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <span className="prr-mm-index" aria-hidden="true">{isPlaying ? <EqualizerIcon /> : index + 1}</span>
                <input className="prr-mm-title" defaultValue={track.title} maxLength={80} disabled={busy}
                  aria-label="Tên bài" onBlur={event => rename(track, event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                <span className="prr-mm-duration">
                  {track.duration_seconds ? formatClock(track.duration_seconds) : <em title="Đang đọc thời lượng. Bài chưa có thời lượng sẽ chưa vào radio.">…</em>}
                </span>
                {confirmId === track.id ? (
                  <span className="prr-mm-confirm">
                    <button type="button" className="prr-mm-danger" disabled={busy} onClick={() => remove(track)}>Xóa hẳn</button>
                    <button type="button" className="prr-mm-text" onClick={() => setConfirmId(null)}>Hủy</button>
                  </span>
                ) : (
                  <span className="prr-mm-actions">
                    <button type="button" className="prr-mm-icon" disabled={busy || !track.active || !track.duration_seconds || isPlaying}
                      onClick={() => play(track.id)} aria-label={`Phát ${track.title} ngay`} title="Phát bài này cho mọi người"><Play size={16} aria-hidden="true" /></button>
                    <button type="button" role="switch" className="prr-mm-switch" aria-checked={track.active} disabled={busy}
                      aria-label={`${track.active ? 'Tắt' : 'Bật'} ${track.title} trong radio`} title={track.active ? 'Đang trong radio' : 'Đã tắt khỏi radio'}
                      onClick={() => patch(track, { active: !track.active })}><span /></button>
                    <button type="button" className="prr-mm-icon" disabled={busy}
                      onClick={() => setConfirmId(track.id)} aria-label={`Xóa ${track.title}`}><Trash2 size={16} aria-hidden="true" /></button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <footer className="prr-mm-foot">
        {uploads.length > 0 && (
          <ul className="prr-mm-uploads" aria-live="polite">
            {uploads.map(item => (
              <li key={item.key} data-state={item.state}>
                <span>{item.name}</span>
                <em>{{ waiting: 'Đang chờ', working: 'Đang tải lên…', done: 'Xong', error: item.note }[item.state]}</em>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileInputRef} type="file" accept=".mp3,.m4a,.ogg,.wav,audio/*" multiple hidden
          onChange={event => { uploadFiles(event.target.files); event.target.value = ''; }} />
        <button type="button" className="prr-mm-drop" data-over={fileOver} disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={event => { if (isFileDrag(event)) { event.preventDefault(); setFileOver(true); } }}
          onDragLeave={() => setFileOver(false)} onDrop={onDropFiles}>
          <Upload size={18} aria-hidden="true" />
          <span><strong>{busy ? 'Đang xử lý…' : 'Thêm nhạc'}</strong> · kéo thả hoặc chọn nhiều file</span>
          <small>mp3, m4a, ogg, wav · tối đa 15 MB mỗi file</small>
        </button>
      </footer>
    </ModalDialog>
  );
}
