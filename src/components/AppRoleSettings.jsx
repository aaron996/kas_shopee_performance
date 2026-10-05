import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import LoadingScreen from './LoadingScreen';

const ERRORS = {
  ROLE_MANAGEMENT_FORBIDDEN: 'Chỉ Dev được phân quyền. Hãy tải lại phiên đăng nhập.',
  ROLE_SELF_DEMOTION: 'Bạn không thể tự hạ quyền Dev của mình.',
  ROLE_LAST_DEV: 'Không thể hạ quyền tài khoản Dev cuối cùng.',
  ROLE_CHANGED_RELOAD: 'Quyền đã được thay đổi ở phiên khác. Hãy tải lại danh sách.',
  ROLE_USER_NOT_FOUND: 'Tài khoản chưa đăng nhập hoặc không thuộc danh sách được phép.'
};
function errorMessage(error) {
  return Object.entries(ERRORS).find(([code]) => error?.message?.includes(code))?.[1] || 'Không thể cập nhật phân quyền. Vui lòng thử lại.';
}

export default function AppRoleSettings({ currentUser }) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const { data: result, error: rpcError } = await supabase.rpc('dev_list_app_users', { p_search: query.trim(), p_offset: offset });
      if (request !== generation.current) return;
      if (rpcError) throw rpcError;
      setData(result);
      setDrafts({});
    } catch (err) {
      if (request === generation.current) { setData({ users: [], total: 0 }); setError(errorMessage(err)); }
    } finally { if (request === generation.current) setLoading(false); }
  }, [query, offset]);
  useEffect(() => {
    const requests = generation;
    const timer = setTimeout(load, 250);
    return () => { clearTimeout(timer); requests.current++; };
  }, [load]);
  const save = async user => {
    const role = drafts[user.email];
    if (!role || role === user.role || saving) return;
    setSaving(user.email);
    setError('');
    setNotice('');
    try {
      const { error: rpcError } = await supabase.rpc('dev_set_app_user_role', { p_email: user.email, p_role: role, p_expected_role: user.role });
      if (rpcError) throw rpcError;
      setNotice(`Đã đổi ${user.email} sang ${role}. Phiên đang mở cập nhật khi quay lại app hoặc trong 1 phút.`);
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(null); }
  };
  return <section className="role-settings" aria-labelledby="role-settings-title">
    <h2 id="role-settings-title">Phân quyền tài khoản</h2>
    <p>Dev quản trị toàn bộ app. Admin xem COD nâng cao và SMS. User xem báo cáo thông thường.</p>
    <p>Danh sách gồm tài khoản đã đăng nhập. Chỉ Dev được đổi quyền; không thể tự hạ quyền Dev.</p>
    <div className="role-settings-toolbar">
      <label className="role-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Tìm tài khoản theo email" placeholder="Tìm email…" value={query} disabled={Boolean(saving)} onChange={event => { setQuery(event.target.value); setOffset(0); }} /></label>
      <button type="button" className="btn-secondary" onClick={load} disabled={loading || Boolean(saving)}><RefreshCw size={16} /> Tải lại</button>
    </div>
    {error && <p role="alert" className="role-settings-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <LoadingScreen variant="contained" /> : <>
      <div className="role-settings-table"><table><thead><tr><th>Email</th><th>Role hiện tại</th><th>Đổi role</th><th>Thao tác</th></tr></thead><tbody>
        {data.users.map(user => {
          const self = user.email === currentUser?.email?.toLowerCase();
          return <tr key={user.email}><td>{user.email}{self && <span className="role-self"> · Bạn</span>}</td><td><strong>{user.role}</strong></td>
            <td><select aria-label={`Role cho ${user.email}`} value={drafts[user.email] || user.role} disabled={Boolean(saving) || (self && user.role === 'dev')} onChange={event => setDrafts(previous => ({ ...previous, [user.email]: event.target.value }))}><option value="user">User</option><option value="admin">Admin</option><option value="dev">Dev</option></select></td>
            <td><button type="button" className="btn-secondary" disabled={Boolean(saving) || !drafts[user.email] || drafts[user.email] === user.role} onClick={() => save(user)}>{saving === user.email ? 'Đang lưu…' : 'Lưu quyền'}</button></td></tr>;
        })}
      </tbody></table></div>
      {data.users.length === 0 && <p>Không tìm thấy tài khoản phù hợp.</p>}
      <div className="role-settings-pagination"><span>{data.total} tài khoản · Trang {Math.floor(offset / 50) + 1}</span><button type="button" className="btn-secondary" disabled={!offset || Boolean(saving)} onClick={() => setOffset(previous => previous - 50)}>Trước</button><button type="button" className="btn-secondary" disabled={offset + 50 >= data.total || Boolean(saving)} onClick={() => setOffset(previous => previous + 50)}>Sau</button></div>
    </>}
  </section>;
}
