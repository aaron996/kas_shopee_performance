import LoadingScreen from './LoadingScreen.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, HelpCircle, RefreshCw, Search, Users, X } from 'lucide-react';
import { supabase } from '../utils/supabaseClient.js';
import { readDevResource } from '../utils/devDataClient.js';
import { formatActiveTime } from '../utils/appUsageTracker.js';
import { formatAccessTime } from '../utils/devAccessActivity.js';
import { getModule } from '../modules/moduleRegistry.jsx';
import DateField from './ui/DateField.jsx';
import {
  buildMonitorCsv, formatMonitorDay, monitorRange, monitorRangeError,
  monitorScopeKey, monitorToday, sortMonitorUsers
} from '../utils/appUsageMonitor.js';
import './AppUsageActivity.css';

const label = id => getModule(id)?.label || id;
const number = value => Number(value || 0).toLocaleString('vi-VN');
const tabNames = tabs => (tabs || []).map(label).join(', ');
const shortTime = value => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const scopeText = filters => filters.day ? `Ngày ${formatMonitorDay(filters.day)}` : `${formatMonitorDay(filters.from)} – ${formatMonitorDay(filters.to)}`;
const PRESETS = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['7', '7 ngày gần nhất'], ['30', '30 ngày gần nhất'], ['custom', 'Tùy chọn']];

function UsageDetail({ email, data, loading, error, filters, onClose, onRetry }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [email]);
  const user = !loading && !error && data?.users?.find(row => row.email === email);
  return <aside id="monitor-user-detail" className="monitor-detail" aria-labelledby="monitor-detail-title" aria-busy={loading}>
    <div className="monitor-detail-head"><button type="button" className="monitor-text-button" onClick={onClose}><ArrowLeft size={15} aria-hidden="true" />Quay lại danh sách</button><button type="button" className="monitor-icon-button" aria-label="Đóng chi tiết tài khoản" onClick={onClose}><X size={18} /></button></div>
    <h3 id="monitor-detail-title" tabIndex={-1} ref={heading}>{email}</h3>
    <p className="monitor-subtext">{scopeText(filters)}{filters.tab ? ` · ${label(filters.tab)}` : ''}</p>
    {loading ? <LoadingScreen /> : error ? <p className="dev-panel-error" role="alert">{error} <button type="button" className="btn-secondary" onClick={onRetry}>Thử lại</button></p> : !user ? <p role="status" className="monitor-empty">Tài khoản này chưa có hoạt động trong phạm vi đang chọn.</p> : <>
      <dl className="monitor-detail-stats"><div><dt>Phiên</dt><dd>{number(user.sessions)}</dd></div><div><dt>Hoạt động</dt><dd>{formatActiveTime(user.active_ms)}</dd></div><div><dt>Lượt xem tab</dt><dd>{number(user.views)}</dd></div></dl>
      <dl className="monitor-detail-times"><div><dt>Lần đầu trong phạm vi</dt><dd>{formatAccessTime(user.first_seen_at)}</dd></div><div><dt>Gần nhất</dt><dd>{formatAccessTime(user.last_seen_at)}</dd></div></dl>
      <section className="monitor-detail-section"><h4>Tab đã xem</h4><div className="monitor-detail-tab-head"><span>Tab</span><span>Lượt xem · Hoạt động</span></div>{data.tabs.map(tab => <div className="monitor-detail-tab" key={tab.tab_id}><span>{label(tab.tab_id)}</span><span>{number(tab.views)} · {formatActiveTime(tab.active_ms)}</span></div>)}</section>
      <section className="monitor-detail-section"><h4>Các phiên trong phạm vi</h4><p className="monitor-subtext">{user.sessions > 100 ? `Hiện 100 / ${number(user.sessions)} phiên gần nhất.` : `${number(user.sessions)} phiên.`} Thời gian dưới đây chỉ tính lúc hoạt động.</p><ol className="monitor-session-list">{data.sessions.map(session => <li key={session.session_id}><div><time dateTime={session.started_at}>{shortTime(session.started_at)}</time><ChevronRight size={12} aria-hidden="true" /><time dateTime={session.last_seen_at}>{shortTime(session.last_seen_at)}</time></div><strong>{formatActiveTime(session.active_ms)}</strong><p>{tabNames(session.tabs)}</p></li>)}</ol></section>
      <section className="monitor-detail-section"><h4>Hành động</h4><div className="monitor-action-counts"><span>Câu hỏi chatbot <strong>{number(user.chat_questions)}</strong></span><span>Tải CSV báo cáo <strong>{number(user.exports)}</strong></span></div></section>
    </>}
  </aside>;
}

export function AppUsageView({
  data, loading, error, filters, onFilters, onRefresh, onlineUsers = [],
  selectedEmail = '', onSelectUser, onCloseDetail, detailData, detailLoading, detailError, onRetryDetail
}) {
  const [search, setSearch] = useState(''), [sort, setSort] = useState('recent'), [tabMetric, setTabMetric] = useState('users');
  const [page, setPage] = useState(0), [showDaily, setShowDaily] = useState(false);
  const [draftRange, setDraftRange] = useState({ from: filters.from, to: filters.to });
  const lastUserButton = useRef(null), tableHeading = useRef(null);
  const currentScope = monitorScopeKey(filters);
  useEffect(() => { setPage(0); }, [currentScope, search, sort]);
  useEffect(() => { setDraftRange({ from: filters.from, to: filters.to }); }, [filters.from, filters.to]);
  const visible = !loading && !error && data;
  const firstTrackedDay = data?.first_tracked_at ? monitorToday(Date.parse(data.first_tracked_at)) : '';
  const trackedScope = Boolean(firstTrackedDay && (filters.day || filters.to) >= firstTrackedDay);
  const totals = visible && trackedScope ? data.totals : null;
  const users = useMemo(() => sortMonitorUsers(visible ? data.users : [], search, sort), [visible, data, search, sort]);
  const lastPage = Math.max(0, Math.ceil(users.length / 20) - 1), currentPage = Math.min(page, lastPage);
  const shown = users.slice(currentPage * 20, currentPage * 20 + 20);
  const daily = visible ? data.days : [];
  const maxUsers = Math.max(1, ...daily.map(day => day.users));
  const tabs = visible ? [...data.tabs].sort((a,b) => b[tabMetric]-a[tabMetric] || a.tab_id.localeCompare(b.tab_id)) : [];
  const maxTabs = Math.max(1, ...tabs.map(tab => tab[tabMetric]));
  const rangeError = monitorRangeError(draftRange);
  const patch = change => onFilters({ ...filters, ...change });
  const closeDetail = () => { onCloseDetail(); requestAnimationFrame(() => lastUserButton.current?.isConnected ? lastUserButton.current.focus() : tableHeading.current?.focus()); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildMonitorCsv(users, filters, label)], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `GHN_nguoi-su-dung_${filters.day || `${filters.from}_${filters.to}`}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const onlineCount = new Set(onlineUsers.map(user => user.email)).size;
  return <div className={`usage-monitor${selectedEmail ? ' has-detail' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape' && selectedEmail && !event.defaultPrevented) { event.stopPropagation(); closeDetail(); }
  }}>
    <div className="monitor-header"><div><h3>Theo dõi sử dụng</h3><p className="monitor-subtext">{visible ? `Cập nhật ${formatAccessTime(data.generated_at)}` : loading ? 'Giờ Việt Nam' : 'Chưa tải được thống kê'}{visible && ' · Giờ Việt Nam'}</p></div><div className="monitor-header-actions"><span className="monitor-online" title="Trạng thái hiện tại, không phụ thuộc bộ lọc lịch sử"><Users size={15} aria-hidden="true" />Đang online: <strong>{number(onlineCount)}</strong></span><button className="btn-secondary" disabled={loading} type="button" onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" />Làm mới</button></div></div>
    <div className="monitor-overview">
      <div className="monitor-filters">
        <label>Khoảng ngày<select value={filters.preset} onChange={event => {
          const preset = event.target.value;
          if (preset === 'custom') patch({ preset });
          else patch({ preset, ...monitorRange(preset), day: '' });
        }}>{PRESETS.map(([value,title]) => <option value={value} key={value}>{title}</option>)}</select></label>
        <label>Tài khoản<select value={filters.email} onChange={event => patch({ email: event.target.value })}><option value="">Tất cả tài khoản</option>{[...new Set([...(data?.options?.emails || []), filters.email].filter(Boolean))].map(email => <option key={email} value={email}>{email}</option>)}</select></label>
        <label>Tab báo cáo<select value={filters.tab} onChange={event => patch({ tab: event.target.value })}><option value="">Tất cả tab</option>{[...new Set([...(data?.options?.tabs || []), filters.tab].filter(Boolean))].map(id => <option key={id} value={id}>{label(id)}</option>)}</select></label>
      </div>
      {filters.preset === 'custom' && <form className="monitor-custom-range" onSubmit={event => { event.preventDefault(); if (!rangeError) patch({ ...draftRange, day: '' }); }}><div><span>Từ ngày</span><DateField label="Từ ngày" value={draftRange.from} max={monitorToday()} onChange={from => setDraftRange(value => ({ ...value, from }))} /></div><div><span>Đến ngày</span><DateField label="Đến ngày" value={draftRange.to} max={monitorToday()} onChange={to => setDraftRange(value => ({ ...value, to }))} /></div><button type="submit" className="btn-secondary" disabled={Boolean(rangeError)}>Áp dụng</button>{rangeError && <p role="alert">{rangeError}</p>}</form>}
      <div className="monitor-scope" aria-live="polite"><span>Phạm vi: <strong>{scopeText(filters)}</strong></span>{filters.day && <button type="button" onClick={() => patch({ day: '' })} aria-label="Bỏ lọc ngày">Ngày {formatMonitorDay(filters.day)}<X size={13} aria-hidden="true" /></button>}{filters.email && <button type="button" onClick={() => patch({ email: '' })} aria-label="Bỏ lọc tài khoản">{filters.email}<X size={13} aria-hidden="true" /></button>}{filters.tab && <button type="button" onClick={() => patch({ tab: '' })} aria-label="Bỏ lọc tab báo cáo">{label(filters.tab)}<X size={13} aria-hidden="true" /></button>}</div>
      {error && <p className="dev-panel-error" role="alert">{error} <button type="button" className="btn-secondary" onClick={onRefresh}>Thử lại</button></p>}
      <dl className="monitor-metrics" aria-busy={loading}>{[
        ['Người sử dụng', totals && number(totals.users)], ['Phiên sử dụng', totals && number(totals.sessions)],
        ['Thời gian dùng', totals && formatActiveTime(totals.active_ms)],
        ['Trung bình / phiên', totals && formatActiveTime(totals.sessions ? totals.active_ms / totals.sessions : 0)]
      ].map(([title,value]) => <div key={title}><dt>{title}</dt><dd>{loading ? <LoadingScreen variant="inline" /> : value ?? '—'}</dd></div>)}</dl>
      <div className="monitor-charts" aria-busy={loading}>
        <section className="monitor-daily" aria-labelledby="monitor-daily-title"><div className="monitor-section-head"><h4 id="monitor-daily-title">Người sử dụng theo ngày</h4><button type="button" className="monitor-text-button" aria-expanded={showDaily} onClick={() => setShowDaily(value => !value)}>{showDaily ? 'Ẩn bảng ngày' : 'Bảng ngày'}</button></div><p className="monitor-subtext">{formatMonitorDay(filters.from)} – {formatMonitorDay(filters.to)} · Bấm ngày để xem người dùng.</p>
          {visible ? <div className="monitor-daily-scroll"><div className="monitor-daily-bars">{daily.map(day => <button type="button" key={day.day} aria-pressed={filters.day === day.day} aria-label={`${formatMonitorDay(day.day)}: ${day.tracked ? `${number(day.users)} người` : 'chưa có dữ liệu theo dõi'}`} onClick={() => patch({ day: filters.day === day.day ? '' : day.day })}><strong>{day.tracked ? number(day.users) : '—'}</strong><span className="monitor-bar-track"><span style={{ height: `${day.users / maxUsers * 100}%` }} /></span><time dateTime={day.day}>{day.day.slice(8)}/{day.day.slice(5,7)}</time>{filters.day === day.day && <span className="monitor-day-mark">Đang chọn</span>}</button>)}</div></div> : <div className="monitor-chart-placeholder">{loading ? <LoadingScreen /> : 'Chưa tải được xu hướng.'}</div>}
          {visible && showDaily && <div className="monitor-daily-table"><table><caption>Số người theo ngày; phiên qua nửa đêm có thể xuất hiện ở hai ngày.</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Người</th><th scope="col">Phiên</th><th scope="col">Hoạt động</th></tr></thead><tbody>{daily.map(day => <tr key={day.day}><td><button type="button" className="monitor-text-button" aria-pressed={filters.day === day.day} onClick={() => patch({ day: filters.day === day.day ? '' : day.day })}>{formatMonitorDay(day.day)}</button></td><td>{day.tracked ? number(day.users) : '—'}</td><td>{day.tracked ? number(day.sessions) : '—'}</td><td>{day.tracked ? formatActiveTime(day.active_ms) : '—'}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="monitor-tab-ranking" aria-labelledby="monitor-tabs-title"><div className="monitor-section-head"><h4 id="monitor-tabs-title">Tab được sử dụng</h4><label className="monitor-metric-select"><span className="monitor-sr-only">Xếp hạng tab theo</span><select value={tabMetric} onChange={event => setTabMetric(event.target.value)}><option value="users">Người xem</option><option value="views">Lượt xem</option><option value="active_ms">Thời gian</option></select></label></div><p className="monitor-subtext">{scopeText(filters)} · Bấm tab để lọc.</p>{tabs.length ? <ol>{tabs.map(tab => <li key={tab.tab_id}><button type="button" aria-pressed={filters.tab === tab.tab_id} onClick={() => patch({ tab: filters.tab === tab.tab_id ? '' : tab.tab_id })}><span>{label(tab.tab_id)}</span><strong>{tabMetric === 'active_ms' ? formatActiveTime(tab.active_ms) : number(tab[tabMetric])}</strong><span className="monitor-rank-track"><span style={{ width: `${tab[tabMetric]/maxTabs*100}%` }} /></span></button></li>)}</ol> : <div className="monitor-chart-placeholder">{loading ? <LoadingScreen /> : error ? 'Chưa tải được các tab.' : 'Chưa có tab trong phạm vi này.'}</div>}</section>
      </div>
    </div>
    <div className="monitor-master-detail">
      <section className="monitor-users" aria-labelledby="monitor-users-title"><div className="monitor-users-head"><div><h4 id="monitor-users-title" ref={tableHeading} tabIndex={-1}>Người dùng{filters.day ? ` ngày ${formatMonitorDay(filters.day)}` : ' trong kỳ'}</h4><p className="monitor-subtext">Chọn email để xem phiên và tab đã dùng.</p></div><button type="button" className="btn-secondary" disabled={!visible || !users.length} onClick={download}><Download size={15} aria-hidden="true" />Xuất CSV</button></div>
        <div className="monitor-user-tools"><label className="monitor-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Tìm email người dùng" placeholder="Tìm email…" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="monitor-sort"><span className="monitor-sr-only">Sắp xếp người dùng</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Truy cập gần nhất</option><option value="active">Thời gian dùng nhiều nhất</option><option value="sessions">Số phiên nhiều nhất</option></select></label></div>
        <div className="monitor-user-table" aria-busy={loading}><table><caption className="monitor-sr-only">Người dùng trong {scopeText(filters).toLowerCase()}</caption><thead><tr>{['Email','Phiên','Thời gian dùng','Tab đã xem','Gần nhất'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{!shown.length ? <tr><td colSpan={5} className="monitor-empty" role={loading ? undefined : "status"}>{loading ? <LoadingScreen /> : error ? 'Chưa tải được danh sách. Bấm Thử lại.' : search ? 'Không có email phù hợp.' : !trackedScope ? 'Chưa có dữ liệu theo dõi cho phạm vi này. Log cũ không ghi thời gian hoặc tab đã xem.' : filters.day ? `Không ghi nhận người dùng ngày ${formatMonitorDay(filters.day)}${filters.tab ? ` tại tab ${label(filters.tab)}` : ''}.` : 'Chưa ghi nhận sử dụng trong phạm vi này. Thử chọn khoảng ngày khác.'}</td></tr> : shown.map(user => <tr key={user.user_id} className={selectedEmail === user.email ? 'is-selected' : ''}><td data-label="Email"><button type="button" className="monitor-user-link" aria-expanded={selectedEmail === user.email} aria-controls={selectedEmail === user.email ? 'monitor-user-detail' : undefined} onClick={event => { lastUserButton.current = event.currentTarget; onSelectUser(user.email); }}>{user.email}<ChevronRight size={14} aria-hidden="true" /></button></td><td data-label="Phiên">{number(user.sessions)}</td><td data-label="Thời gian dùng">{formatActiveTime(user.active_ms)}</td><td data-label="Tab đã xem" className="monitor-user-tabs">{tabNames(user.tabs)}</td><td data-label="Gần nhất"><time dateTime={user.last_seen_at} title={formatAccessTime(user.last_seen_at)}>{shortTime(user.last_seen_at)}</time></td></tr>)}</tbody></table></div>
        <div className="monitor-pagination"><span>{visible ? `${number(users.length)} người · Trang ${currentPage+1}/${lastPage+1}` : '—'}</span><button type="button" className="btn-secondary" disabled={!visible || currentPage === 0} onClick={() => setPage(currentPage-1)}>Trước</button><button type="button" className="btn-secondary" disabled={!visible || currentPage === lastPage} onClick={() => setPage(currentPage+1)}>Sau</button></div>
      </section>
      {selectedEmail && <UsageDetail email={selectedEmail} data={detailData} loading={detailLoading} error={detailError} filters={filters} onClose={closeDetail} onRetry={onRetryDetail} />}
    </div>
    <details className="monitor-method"><summary><HelpCircle size={15} aria-hidden="true" />Cách tính & phạm vi dữ liệu</summary><div><p>Chỉ tính thời gian khi cửa sổ app đang được chọn. Sau 2 phút không tương tác, thời gian tạm ngừng cộng. Tải lại app hoặc trở lại sau 30 phút không tương tác tạo phiên mới.</p><p>Số người và phiên trong kỳ đếm riêng biệt, không cộng trực tiếp các ngày hoặc tab. Các phiên qua nửa đêm được tách thời gian theo ngày Việt Nam.</p><p>{data?.first_tracked_at ? `Bắt đầu ghi nhận ${formatAccessTime(data.first_tracked_at)}. Ngày trước mốc này hiển thị “—”, không coi là 0.` : 'Chưa có mốc bắt đầu ghi nhận. Log cũ không có thời gian hoạt động hoặc tab.'} Dữ liệu gửi theo đợt khoảng 30 giây, có thể thiếu phần cuối khi đóng app hoặc mất mạng.</p><p>Tab trong phiên là danh sách đã xem, chưa phải thứ tự chuyển tab. Số lượt tải CSV chỉ gồm báo cáo qua hộp thoại Tải CSV; số câu hỏi chatbot tính lúc API tiếp nhận.</p></div></details>
  </div>;
}

function useMonitorResource(currentUser, filters, enabled = true) {
  const paramsKey = monitorScopeKey(filters);
  const key = JSON.stringify([currentUser?.supabaseUser?.id, currentUser?.email, currentUser?.role, currentUser?.isDevAdmin, paramsKey]);
  const [state,setState] = useState({ key: '', data: null, error: '', loading: true });
  const request = useRef(null);
  const load = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setState(previous => ({ ...previous, key, loading: true, error: '' }));
    try {
      const result = await readDevResource(currentUser, `usage-monitor:${key}`, async () => {
        const response = await supabase.rpc('dev_app_usage_monitor', JSON.parse(paramsKey));
        if (response.error) throw response.error;
        return response.data;
      }, { forceRefresh, signal: controller.signal });
      if (!controller.signal.aborted) setState({ key, data: result, loading: false, error: '' });
    } catch (reason) {
      if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: ['PGRST202','42883'].includes(reason.code)
        ? 'Chưa bật thống kê Monitor trên máy chủ. Cần cập nhật dữ liệu theo phiên bản mới rồi thử lại.'
        : 'Không tải được thống kê. Kiểm tra kết nối và quyền Dev rồi thử lại.' });
    }
  }, [currentUser, key, paramsKey, enabled]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  const sameScope = state.key === key;
  return { data: sameScope ? state.data : null, loading: enabled && (!sameScope || state.loading), error: sameScope ? state.error : '', refresh: () => load(true) };
}

export default function AppUsageActivity({ currentUser, onlineUsers }) {
  const [filters,setFilters] = useState(() => ({ preset: '7', ...monitorRange('7'), email: '', tab: '', day: '' }));
  const [selectedEmail,setSelectedEmail] = useState('');
  const main = useMonitorResource(currentUser, filters);
  const detailFilters = { ...filters, email: selectedEmail };
  const detail = useMonitorResource(currentUser, detailFilters, Boolean(selectedEmail));
  const changeFilters = next => { setFilters(next); setSelectedEmail(''); };
  const refresh = () => {
    if (filters.preset !== 'custom') {
      const next = monitorRange(filters.preset);
      if (next.from !== filters.from || next.to !== filters.to) {
        changeFilters({ ...filters, ...next, day: '' });
        return;
      }
    }
    void main.refresh(); if (selectedEmail) void detail.refresh();
  };
  return <AppUsageView {...{ filters, onlineUsers, selectedEmail }} data={main.data} loading={main.loading} error={main.error}
    onFilters={changeFilters} onRefresh={refresh} onSelectUser={setSelectedEmail} onCloseDetail={() => setSelectedEmail('')}
    detailData={detail.data} detailLoading={detail.loading} detailError={detail.error} onRetryDetail={detail.refresh} />;
}
