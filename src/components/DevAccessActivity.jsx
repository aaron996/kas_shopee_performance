import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { formatAccessTime, summarizeAccess } from '../utils/devAccessActivity';

const PAGE_SIZE = 1000;
const DISPLAY_SIZE = 50;
function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DevAccessActivity({ onlineUsers }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [list, setList] = useState('users');
  const [page, setPage] = useState(0);
  const request = useRef(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const rows = [];
      const until = new Date().toISOString();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: queryError } = await supabase.from('access_logs').select('email, accessed_at')
          .lte('accessed_at', until).order('accessed_at', { ascending: false }).order('id', { ascending: false })
          .range(from, from + PAGE_SIZE - 1).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (queryError) throw queryError;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      setLogs(rows); setLoadedAt(new Date()); setPage(0);
    } catch {
      if (!controller.signal.aborted) setError('Không tải được lịch sử truy cập. Thử lại hoặc kiểm tra quyền Dev.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); return () => request.current?.abort(); }, [load]);
  const summary = useMemo(() => summarizeAccess(logs, loadedAt || new Date()), [logs, loadedAt]);
  const source = list === 'users' ? summary.users : list === 'online' ? onlineUsers : logs;
  const filtered = source.filter(row => (row.email || '').toLowerCase().includes(search.trim().toLowerCase()));
  const lastPage = Math.max(0, Math.ceil(filtered.length / DISPLAY_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = filtered.slice(currentPage * DISPLAY_SIZE, (currentPage + 1) * DISPLAY_SIZE);
  const maxCount = Math.max(1, ...summary.days.map(day => day.count));

  return <div className="dev-access">
    <div className="dev-access-toolbar">
      <p>{loadedAt ? `Cập nhật ${formatAccessTime(loadedAt)} · Giờ Việt Nam` : loading ? 'Đang tải lịch sử…' : 'Chưa tải được lịch sử'}</p>
      <button className="btn-secondary" type="button" disabled={loading} onClick={load}><RefreshCw size={15} />{loading ? 'Đang tải…' : 'Làm mới'}</button>
      <details className="dev-access-export"><summary><Download size={15} /> Xuất CSV</summary><div>
        <button type="button" className="btn-secondary" disabled={loading || Boolean(error) || !summary.users.length} onClick={() => downloadCsv('GHN_danh-sach-nguoi-da-truy-cap.csv', ['Email', 'Số lượt truy cập', 'Lần đầu', 'Gần nhất'], summary.users.map(user => [user.email, user.visits, formatAccessTime(user.firstSeen), formatAccessTime(user.lastSeen)]))}>Danh sách người dùng</button>
        <button type="button" className="btn-secondary" disabled={loading || Boolean(error) || !logs.length} onClick={() => downloadCsv('GHN_lich-su-truy-cap.csv', ['Email', 'Thời điểm truy cập'], logs.map(log => [log.email, formatAccessTime(log.accessed_at)]))}>Toàn bộ lịch sử</button>
      </div></details>
    </div>
    {error && <p className="dev-panel-error" role="alert">{error} <button className="btn-secondary" type="button" onClick={load}>Thử lại</button></p>}
    <dl className="dev-access-summary"><div><dt>Người đã truy cập</dt><dd>{loading ? '…' : error ? '—' : summary.users.length.toLocaleString('vi-VN')}</dd></div><div><dt>Đang online</dt><dd>{onlineUsers.length.toLocaleString('vi-VN')}</dd></div><div><dt>Lượt trong 7 ngày</dt><dd>{loading ? '…' : error ? '—' : summary.days.reduce((sum, day) => sum + day.count, 0).toLocaleString('vi-VN')}</dd></div></dl>
    {!loading && !error && <section className="dev-access-chart" aria-labelledby="access-chart-title"><h3 id="access-chart-title">Lượt truy cập · 7 ngày</h3><div>{summary.days.map(({ day, count }) => <div key={day}><span>{count}</span><div className="dev-access-bar-track"><div className="dev-access-bar" style={{ height: `${count / maxCount * 100}%` }} /></div><time dateTime={day}>{day.slice(8)}/{day.slice(5, 7)}</time></div>)}</div></section>}
    <div className="dev-access-list-toolbar"><div aria-label="Danh sách truy cập" className="dev-access-views">{[['users', 'Người dùng'], ['online', 'Đang online'], ['logs', 'Lịch sử']].map(([id, label]) => <button type="button" key={id} aria-pressed={list === id} onClick={() => { setList(id); setPage(0); }}>{label}</button>)}</div><label className="dev-panel-search"><input type="search" aria-label="Tìm email trong danh sách truy cập" value={search} placeholder="Tìm email…" onChange={event => { setSearch(event.target.value); setPage(0); }} /></label></div>
    <div className="dev-access-table" aria-busy={loading && list !== 'online'}><table><caption>{list === 'users' ? 'Người dùng theo lần truy cập gần nhất' : list === 'online' ? 'Các phiên đang online' : 'Lịch sử truy cập gần nhất'}</caption><thead><tr><th>Email</th>{list === 'users' && <><th>Lượt</th><th>Lần đầu</th></>}<th>{list === 'online' ? 'Bắt đầu phiên' : 'Gần nhất'}</th></tr></thead><tbody>
      {loading && list !== 'online' ? <tr><td colSpan={4} role="status">Đang tải lịch sử truy cập…</td></tr> : error && list !== 'online' ? <tr><td colSpan={4}>Không có dữ liệu mới. Bấm Thử lại để tải.</td></tr> : !rows.length ? <tr><td colSpan={4}>{search ? 'Không có email khớp từ khóa.' : list === 'online' ? 'Chưa có phiên online.' : 'Chưa ghi nhận truy cập.'}</td></tr> : rows.map((row, index) => <tr key={`${row.email}-${index}`}><td>{row.email}</td>{list === 'users' && <><td>{row.visits}</td><td>{formatAccessTime(row.firstSeen)}</td></>}<td>{formatAccessTime(list === 'users' ? row.lastSeen : list === 'online' ? row.online_at : row.accessed_at)}</td></tr>)}
    </tbody></table></div>
    <div className="dev-access-pagination"><span>{filtered.length.toLocaleString('vi-VN')} {list === 'logs' ? 'lượt' : 'người / phiên'} · Trang {currentPage + 1} / {lastPage + 1}</span><button type="button" className="btn-secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trước</button><button type="button" className="btn-secondary" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Sau</button></div>
  </div>;
}
