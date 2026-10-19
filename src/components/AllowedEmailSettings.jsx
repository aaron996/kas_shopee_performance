import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import LoadingScreen from './LoadingScreen';

const ERRORS = {
  ALLOWLIST_FORBIDDEN: 'Chỉ Dev được quản lý danh sách. Hãy tải lại phiên đăng nhập.',
  ALLOWLIST_GHN_IMPLICIT: 'Email @ghn.vn luôn được phép, không cần thêm vào danh sách.',
  ALLOWLIST_EMAIL_INVALID: 'Email không hợp lệ.',
  ALLOWLIST_SELF_REMOVAL: 'Bạn không thể tự xóa email của mình khỏi danh sách.',
  ALLOWLIST_NOT_FOUND: 'Email này không còn trong danh sách. Hãy tải lại.'
};
function errorMessage(error) {
  return Object.entries(ERRORS).find(([code]) => error?.message?.includes(code))?.[1] || 'Không thể cập nhật danh sách. Vui lòng thử lại.';
}

export default function AllowedEmailSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('dev_list_allowed_emails');
      if (rpcError) throw rpcError;
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setItems([]);
      setError(errorMessage(err));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (run, successText) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: rpcError } = await run();
      if (rpcError) throw rpcError;
      setNotice(successText);
      await load();
      return true;
    } catch (err) { setError(errorMessage(err)); return false; }
    finally { setBusy(false); }
  };

  const add = async event => {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    const ok = await mutate(() => supabase.rpc('dev_add_allowed_email', { p_email: clean, p_note: note.trim() || null }), `Đã thêm ${clean}. Người này có thể đăng nhập ngay.`);
    if (ok) { setEmail(''); setNote(''); }
  };
  const remove = item => {
    if (!window.confirm(`Xóa ${item.email} khỏi danh sách? Phiên đang mở sẽ bị đăng xuất trong vòng 1 phút.`)) return;
    void mutate(() => supabase.rpc('dev_remove_allowed_email', { p_email: item.email }), `Đã xóa ${item.email}.`);
  };

  return <section className="role-settings" aria-labelledby="allowlist-title">
    <h2 id="allowlist-title">Email ngoài GHN được phép truy cập</h2>
    <p>Email @ghn.vn luôn được phép. Chỉ cần thêm các email khác (ví dụ Gmail) vào đây. Người được thêm vẫn phải đăng nhập bằng Google hoặc link OTP; sau đó bạn gán role ở mục Phân quyền.</p>
    <form className="role-settings-toolbar" onSubmit={add}>
      <input type="email" aria-label="Email cần thêm" placeholder="email@gmail.com" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} required />
      <input type="text" aria-label="Ghi chú" placeholder="Ghi chú (không bắt buộc)" value={note} maxLength={120} disabled={busy} onChange={event => setNote(event.target.value)} />
      <button type="submit" className="btn-secondary" disabled={busy || !email.trim()}><UserPlus size={16} /> Thêm</button>
      <button type="button" className="btn-secondary" onClick={load} disabled={loading || busy}><RefreshCw size={16} /> Tải lại</button>
    </form>
    {error && <p role="alert" className="role-settings-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <LoadingScreen variant="block" /> : <>
      <div className="role-settings-table"><table><thead><tr><th>Email</th><th>Ghi chú</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {items.map(item => <tr key={item.email}>
          <td>{item.email}</td><td>{item.note || '—'}</td><td>{item.signed_in ? 'Đã có tài khoản' : 'Chưa đăng nhập lần nào'}</td>
          <td><button type="button" className="btn-secondary" disabled={busy} onClick={() => remove(item)}><Trash2 size={16} /> Xóa</button></td>
        </tr>)}
      </tbody></table></div>
      {items.length === 0 && <p>Chưa có email ngoài GHN nào trong danh sách.</p>}
    </>}
  </section>;
}
