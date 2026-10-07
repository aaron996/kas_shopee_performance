import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDevApi } from '../utils/devDataClient.js';

const formatTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const RUN_STATUS = { queued: 'Đang chờ', running: 'Đang chấm', completed: 'Hoàn tất', failed: 'Lỗi', timed_out: 'Quá thời gian chờ', partial: 'Hoàn tất, có đơn lỗi' };

export default function CodSmsScheduleSettings({ currentUser }) {
  const [current, setCurrent] = useState(null);
  const [time, setTime] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const request = useRef(null);
  const accept = value => { setCurrent(value); setTime(value.time); setEnabled(value.enabled); };
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading'); setMessage('');
    try {
      const value = await fetchDevApi(currentUser, '/api/cod-sms-schedule', { forceRefresh: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      accept(value); setStatus('ready');
    } catch (error) {
      if (!controller.signal.aborted) { setStatus('error'); setMessage(error.message); }
    }
  }, [currentUser]);
  useEffect(() => { load(); return () => request.current?.abort(); }, [load]);

  async function save(event) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('saving'); setMessage('');
    try {
      const value = await fetchDevApi(currentUser, '/api/cod-sms-schedule', {
        method: 'POST', body: JSON.stringify({ enabled, time }), signal: controller.signal
      });
      if (controller.signal.aborted) return;
      accept(value); setStatus('ready'); setMessage('Đã lưu lịch. Thay đổi áp dụng cho lần chạy kế tiếp.');
    } catch (error) {
      if (!controller.signal.aborted) { setStatus('ready'); setMessage(error.message); }
    }
  }
  const busy = status === 'loading' || status === 'saving';
  const lastRun = current?.lastRun;
  return <div className="cod-schedule-settings">
    {status === 'loading' && <p role="status">Đang tải lịch chấm SMS…</p>}
    {status === 'error' && <p role="alert">{message} <button type="button" className="btn-secondary" onClick={load}>Thử lại</button></p>}
    {current && status !== 'error' && status !== 'loading' && <>
      {!current.ready && <p role="status">Lịch tự động chưa được kết nối. Có thể lưu giờ mong muốn; cần hoàn tất cấu hình backend trước khi bật.</p>}
      <dl className="cod-schedule-summary">
        <div><dt>Lịch đang áp dụng</dt><dd>{current.enabled ? `${current.time} hằng ngày` : 'Đang tắt'}</dd></div>
        <div><dt>Lần chạy kế tiếp · giờ VN</dt><dd>{current.enabled ? formatTime(current.nextRunAt) : '—'}</dd></div>
        <div><dt>Lần chạy gần nhất · giờ VN</dt><dd>{lastRun ? `${formatTime(lastRun.startedAt || lastRun.createdAt)} · ${RUN_STATUS[lastRun.status] || 'Chưa rõ'}` : 'Chưa có lượt chạy tự động'}</dd></div>
      </dl>
      <form onSubmit={save}>
        <label className="cod-schedule-toggle"><input type="checkbox" checked={enabled} disabled={busy || (!current.ready && !enabled)} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} /> Bật chấm SMS tự động</label>
        <label htmlFor="cod-sms-schedule-time">Giờ chạy hằng ngày · giờ Việt Nam (UTC+7)</label>
        <div className="cod-schedule-actions">
          <input id="cod-sms-schedule-time" type="time" required step="60" value={time} disabled={busy} onChange={event => { setTime(event.target.value); setMessage(''); }} />
          <button type="submit" className="nav-btn primary" disabled={busy || !time || (time === current.time && enabled === current.enabled)}>{status === 'saving' ? 'Đang lưu…' : 'Lưu lịch'}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={load}>Tải lại</button>
        </div>
        <p className="dev-config-policy">Lưu lịch không chạy chấm ngay. Mỗi ngày chỉ có một lượt tự động; nếu hôm nay đã chạy, lịch mới bắt đầu từ ngày mai. Lượt đang chạy vẫn tiếp tục khi tắt lịch.</p>
      </form>
      {message && <p role="status">{message}</p>}
      <details className="dev-panel-details"><summary>Lịch sử thay đổi (20 lượt gần nhất)</summary>
        <div>{current.history?.length ? <ul className="cod-schedule-history">{current.history.map(item => <li key={item.id}><time>{formatTime(item.changedAt)}</time> · {item.time} · {item.enabled ? 'Bật' : 'Tắt'}<br /><span>Người sửa: {item.changedBy}</span></li>)}</ul> : <p>Chưa có thay đổi.</p>}</div>
      </details>
    </>}
  </div>;
}
