import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, Upload, X } from 'lucide-react';
import ModalDialog from '../../components/ui/ModalDialog.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { supabase } from '../../utils/supabaseClient.js';
import { audioContentType, storagePathFor, titleFromFileName, validateAudioFile } from '../../utils/rankingMusicFiles.js';
import { MUSIC_BUCKET, trackUrl } from './useRankingPlaylist.js';

const TABLE = 'ranking_music_tracks';

// Dev-only. Authorization is enforced by RLS (public.is_dev_admin()); the UI gate is a convenience.
export default function RankingMusicManager({ isOpen, onClose, onChanged }) {
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLE).select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setLoading(false);
    if (error) { showToast(`Không tải được danh sách nhạc: ${error.message}`, { tone: 'error' }); return; }
    setTracks(data || []);
  }, [showToast]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  async function run(action, success) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (success) showToast(success, { tone: 'success' });
      await load();
      onChanged?.();
    } catch (error) {
      showToast(error.message || 'Thao tác thất bại.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const problem = validateAudioFile(file);
    if (problem) { showToast(problem, { tone: 'warning' }); return; }
    run(async () => {
      const path = storagePathFor(file.name);
      const { error: uploadError } = await supabase.storage.from(MUSIC_BUCKET)
        .upload(path, file, { contentType: audioContentType(file.name), upsert: false });
      if (uploadError) throw uploadError;
      const sortOrder = tracks.reduce((max, track) => Math.max(max, track.sort_order), -1) + 1;
      const { error: insertError } = await supabase.from(TABLE)
        .insert({ title: titleFromFileName(file.name), file_path: path, sort_order: sortOrder });
      if (insertError) {
        await supabase.storage.from(MUSIC_BUCKET).remove([path]); // don't leave an orphan file
        throw insertError;
      }
    }, 'Đã thêm bài.');
  }

  function patch(track, values, success) {
    return run(async () => {
      const { error } = await supabase.from(TABLE).update(values).eq('id', track.id);
      if (error) throw error;
    }, success);
  }

  function rename(track, title) {
    const next = title.trim();
    if (!next || next === track.title) return;
    patch(track, { title: next }, 'Đã đổi tên.');
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const reordered = [...tracks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    run(async () => {
      // Re-number the whole list so ties from manually inserted rows can't break ordering.
      const changed = reordered.map((track, order) => ({ track, order })).filter(({ track, order }) => track.sort_order !== order);
      const results = await Promise.all(changed.map(({ track, order }) =>
        supabase.from(TABLE).update({ sort_order: order }).eq('id', track.id)));
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;
    });
  }

  function remove(track) {
    run(async () => {
      const { error } = await supabase.from(TABLE).delete().eq('id', track.id);
      if (error) throw error;
      setConfirmId(null);
      const { error: storageError } = await supabase.storage.from(MUSIC_BUCKET).remove([track.file_path]);
      if (storageError) showToast('Đã xóa bài nhưng chưa xóa được file trong kho lưu trữ.', { tone: 'warning' });
    }, 'Đã xóa bài.');
  }

  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} titleId="prr-music-manager-title" className="prr-music-manager">
      <header className="prr-mm-head">
        <h2 id="prr-music-manager-title">Quản lý nhạc nền BXH</h2>
        <button type="button" className="prr-mm-icon" onClick={onClose} aria-label="Đóng"><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="prr-mm-body">
        {loading && tracks.length === 0 && <p className="prr-mm-note">Đang tải…</p>}
        {!loading && tracks.length === 0 && (
          <p className="prr-mm-note">Chưa có bài nào. Khi danh sách trống, BXH phát bài mặc định đi kèm ứng dụng.</p>
        )}
        <ul className="prr-mm-list">
          {tracks.map((track, index) => (
            <li key={track.id} className="prr-mm-item" data-inactive={!track.active}>
              <div className="prr-mm-row">
                <input className="prr-mm-title" defaultValue={track.title} maxLength={80} disabled={busy}
                  aria-label="Tên bài" onBlur={event => rename(track, event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                <label className="prr-mm-active">
                  <input type="checkbox" checked={track.active} disabled={busy}
                    onChange={event => patch(track, { active: event.target.checked })} />
                  Bật
                </label>
                <button type="button" className="prr-mm-icon" disabled={busy || index === 0}
                  onClick={() => move(index, -1)} aria-label="Đưa lên"><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="prr-mm-icon" disabled={busy || index === tracks.length - 1}
                  onClick={() => move(index, 1)} aria-label="Đưa xuống"><ArrowDown size={16} aria-hidden="true" /></button>
                {confirmId === track.id ? (
                  <>
                    <button type="button" className="prr-mm-danger" disabled={busy} onClick={() => remove(track)}>Xóa hẳn</button>
                    <button type="button" className="prr-mm-text" onClick={() => setConfirmId(null)}>Hủy</button>
                  </>
                ) : (
                  <button type="button" className="prr-mm-icon" disabled={busy}
                    onClick={() => setConfirmId(track.id)} aria-label="Xóa bài"><Trash2 size={16} aria-hidden="true" /></button>
                )}
              </div>
              <audio className="prr-mm-audio" controls preload="metadata" src={trackUrl(track.file_path)} />
            </li>
          ))}
        </ul>
      </div>
      <footer className="prr-mm-foot">
        <input ref={fileInputRef} type="file" accept=".mp3,.m4a,.ogg,.wav,audio/*" hidden onChange={upload} />
        <button type="button" className="prr-mm-primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} aria-hidden="true" /> {busy ? 'Đang xử lý…' : 'Tải nhạc lên'}
        </button>
        <span className="prr-mm-note">mp3, m4a, ogg, wav · tối đa 15 MB · người dùng thấy thay đổi khi tải lại trang</span>
      </footer>
    </ModalDialog>
  );
}
