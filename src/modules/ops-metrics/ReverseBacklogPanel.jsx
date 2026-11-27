import React, { useEffect, useMemo, useState } from 'react';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import StatusNotice from '../../components/ui/StatusNotice';
import { supabase } from '../../utils/supabaseClient';
import { AGE_BUCKETS, buildBacklogModel, clearReverseBacklogCache, fetchReverseBacklog, formatDayMonth } from '../../utils/reverseBacklogData';
import './ReverseBacklogPanel.css';

const fmt = value => Number(value).toLocaleString('en-US');
const pct = (value, total) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '–');

// Subtab "Backlog Reverse": backlog L14D của SPE Reverse theo số lần gán x tuổi tồn x vùng.
// Trạng thái chờ khởi tạo từ render đầu; refresh/thử lại giữ số đã có, lỗi báo rõ và cho thử lại.
export default function ReverseBacklogPanel({ selectedRegions = null, selectedHubTypes = null, fetchData = fetchReverseBacklog, client = supabase }) {
  const [state, setState] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ status: 'loading', data: prev.data }));
    fetchData(client)
      .then(data => { if (!cancelled) setState({ status: 'ready', data }); })
      .catch(() => { if (!cancelled) setState(prev => ({ status: 'error', data: prev.data })); });
    return () => { cancelled = true; };
  }, [attempt, fetchData, client]);

  const model = useMemo(() => (state.data?.snapshotDate
    ? buildBacklogModel({ data: state.data, selectedRegions, selectedHubTypes }) : null), [state.data, selectedRegions, selectedHubTypes]);
  const retry = () => { clearReverseBacklogCache(); setAttempt(n => n + 1); };

  const header = (
    <header className="metric-header backlog-head">
      <div className="metric-title">
        <span className="metric-title-text">Backlog L14D theo số lần gán · từng nhóm tuổi tồn</span>
        <span className="metric-title-short">Backlog L14D</span>
        {model && <span className="kpi-badge">Cửa sổ 14 ngày hẹn lấy · {formatDayMonth(model.windowFrom)} – {formatDayMonth(model.snapshotDate)}</span>}
      </div>
    </header>
  );

  if (!state.data && state.status === 'loading') return <div className="metric-block backlog-panel">{header}<LoadingScreen /></div>;
  if (!state.data) {
    return <div className="metric-block backlog-panel">{header}<StatusNotice><p>Chưa tải được backlog Reverse. Vui lòng thử lại.</p>
      <button type="button" className="nav-btn-sleek" onClick={retry}>Thử lại</button></StatusNotice></div>;
  }
  if (!state.data.snapshotDate) {
    return <div className="metric-block backlog-panel">{header}<div className="backlog-note">Chưa có snapshot backlog nào trong hệ thống.</div></div>;
  }
  const { sections, total, maxRow, delta, prevTotal, prevDate, empty } = model;
  return (
    <div className="metric-block backlog-panel">
      {header}
      {state.status === 'error' && <StatusNotice><p>Chưa cập nhật được backlog mới. Đang giữ số liệu đã tải trước đó.</p>
        <button type="button" className="nav-btn-sleek" onClick={retry}>Thử lại</button></StatusNotice>}
      {empty ? <div className="backlog-note">Không có backlog trong phạm vi vùng và loại Hub đang chọn.</div> : <>
        <div className="backlog-kpis">
          <div className="backlog-kpi">
            <span>Tổng tồn còn lại (Backlog L14D)</span>
            <strong>{fmt(total)}</strong>
            {delta === null
              ? <em>Chưa có snapshot tuần trước để so sánh</em>
              : <em className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : undefined}>{delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}{fmt(delta)} so với {formatDayMonth(prevDate)} ({fmt(prevTotal)})</em>}
          </div>
          {sections.map(section => (
            <div className="backlog-kpi" key={section.key}>
              <span>{section.title}</span>
              <strong>{fmt(section.total)}</strong>
              <em>{pct(section.total, total)} Backlog</em>
            </div>
          ))}
        </div>
        {sections.map(section => (
          <section className="backlog-section" key={section.key} aria-label={section.title}>
            <div className="backlog-section-head">
              <h4>{section.title}</h4>
              <span>{fmt(section.total)} đơn · {pct(section.total, total)} Backlog</span>
            </div>
            <div className="backlog-scroll">
              <table className="backlog-table">
                <thead>
                  <tr>
                    <th className="backlog-region">Region</th>
                    <th className="backlog-bar-col">Cơ cấu tuổi tồn</th>
                    <th className="num">Tổng tồn</th>
                    {AGE_BUCKETS.map((bucket, i) => <th className="num" key={bucket.key}><i className={`backlog-dot age-${i}`} />{bucket.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map(row => (
                    <tr key={row.region}>
                      <td className="backlog-region">{row.region}</td>
                      <td className="backlog-bar-col">
                        <div className="backlog-bar" style={{ width: `${maxRow > 0 ? (row.total / maxRow) * 100 : 0}%` }} role="img"
                          aria-label={`${row.region}: ${AGE_BUCKETS.map((b, i) => `${b.label} ${fmt(row.buckets[i])}`).join(', ')}`}>
                          {row.buckets.map((value, i) => value > 0 && <span key={i} className={`age-${i}`} style={{ flexGrow: value }} />)}
                        </div>
                      </td>
                      <td className="num strong">{fmt(row.total)}</td>
                      {row.buckets.map((value, i) => <td className="num" key={i}>{fmt(value)} <small>({pct(value, row.total)})</small></td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="backlog-region">Tổng</td><td />
                    <td className="num strong">{fmt(section.total)}</td>
                    {section.buckets.map((value, i) => <td className="num strong" key={i}>{fmt(value)} <small>({pct(value, section.total)})</small></td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))}
      </>}
    </div>
  );
}
