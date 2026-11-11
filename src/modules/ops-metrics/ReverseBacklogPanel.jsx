import './ReverseBacklogPanel.css';

// BẢN MINH HỌA LAYOUT — số liệu cố định, chưa nối nguồn dữ liệu backlog thật.
// Khi có bảng snapshot backlog, thay SAMPLE_* bằng dữ liệu truy vấn (xem docs/reverse-backlog.md
// hoặc phần "Cột cần có" trong mô tả PR) và bỏ banner minh họa.
const AGE_BUCKETS = [
  { key: 'd13', label: 'Tồn 1–3 ngày' },
  { key: 'd47', label: 'Tồn 4–7 ngày' },
  { key: 'd814', label: 'Tồn 8–14 ngày' }
];
const SAMPLE_SNAPSHOT = { date: '30/10/2026', window: '17/10 – 30/10', prevDate: '23/10', prevTotal: 11436 };
const SAMPLE_SEGMENTS = [
  { key: 'none', title: 'Chưa gán lần nào', rows: [
    ['HNO', 620, 289, 237], ['HCM', 193, 51, 50], ['XBG', 253, 91, 61], ['TNT', 48, 11, 10],
    ['DSH', 29, 4, 4], ['DNB', 23, 2, 2], ['TTB', 2, 1, 0], ['BTB', 31, 7, 5]] },
  { key: 'low', title: 'Gán 1–2 lần', rows: [
    ['HNO', 701, 225, 184], ['HCM', 878, 63, 62], ['XBG', 280, 79, 52], ['TNT', 129, 12, 12],
    ['DSH', 70, 15, 12], ['DNB', 149, 1, 2], ['TTB', 148, 0, 0], ['BTB', 113, 8, 5]] },
  { key: 'high', title: 'Gán ≥ 3 lần', rows: [
    ['HNO', 523, 1071, 876], ['HCM', 614, 1075, 1075], ['XBG', 111, 263, 175], ['TNT', 73, 101, 101],
    ['DSH', 98, 87, 72], ['DNB', 54, 82, 100], ['TTB', 53, 91, 91], ['BTB', 78, 84, 56]] }
];

const fmt = value => Number(value).toLocaleString('en-US');
const pct = (value, total) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '–');

function buildModel(segments) {
  const sections = segments.map(segment => {
    const rows = segment.rows.map(([region, d13, d47, d814]) => ({ region, buckets: [d13, d47, d814], total: d13 + d47 + d814 }));
    const buckets = [0, 1, 2].map(i => rows.reduce((sum, row) => sum + row.buckets[i], 0));
    return { ...segment, rows, buckets, total: buckets.reduce((a, b) => a + b, 0) };
  });
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const maxRow = Math.max(...sections.flatMap(section => section.rows.map(row => row.total)));
  return { sections, total, maxRow };
}

export default function ReverseBacklogPanel() {
  const { sections, total, maxRow } = buildModel(SAMPLE_SEGMENTS);
  const delta = total - SAMPLE_SNAPSHOT.prevTotal;
  return (
    <div className="backlog-panel">
      <header className="backlog-head">
        <h3>Backlog L14D theo số lần gán · từng nhóm tuổi tồn</h3>
        <p>Snapshot {SAMPLE_SNAPSHOT.date} · cửa sổ 14 ngày hẹn lấy ({SAMPLE_SNAPSHOT.window}) · đơn ready_to_pick, không hủy · SPE Reverse</p>
      </header>
      <div className="backlog-sample-note" role="note">
        <strong>BẢN MINH HỌA LAYOUT.</strong> Số liệu là dữ liệu mẫu, chưa nối nguồn backlog thật; cách chia nhóm tuổi và số tuần trước là giá trị giả định.
      </div>
      <div className="backlog-kpis">
        <div className="backlog-kpi">
          <span>Tổng tồn còn lại (Backlog L14D)</span>
          <strong>{fmt(total)}</strong>
          <em className={delta > 0 ? 'is-up' : 'is-down'}>{delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{fmt(delta)} so với {SAMPLE_SNAPSHOT.prevDate} ({fmt(SAMPLE_SNAPSHOT.prevTotal)})</em>
        </div>
        {sections.map(section => (
          <div className="backlog-kpi" key={section.key}>
            <span>{section.title}</span>
            <strong>{fmt(section.total)}</strong>
            <em>{pct(section.total, total)} Backlog</em>
          </div>
        ))}
      </div>
      <div className="backlog-definition"><strong>Tổng tồn còn lại (Backlog)</strong> = tổng đơn chưa lấy thành công tính đến cuối ngày, trong cửa sổ 14 ngày hẹn lấy gần nhất.</div>
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
                      <div className="backlog-bar" style={{ width: `${(row.total / maxRow) * 100}%` }} role="img"
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
    </div>
  );
}
