import React from 'react';
import { formatPct, formatVol } from '../../utils/dataProcessor.js';
import './reverseReport.css';

// Báo cáo tự động SPE Reverse: MỘT tấm hình như file mẫu KA. Cột trái là ba bảng % PUD theo ngày (loại Hub, BC KD theo tỉnh,
// vùng), cột phải là "Gán lấy" theo từng kho BC KD. Dùng chung cho ảnh /snapshot (n8n gửi Telegram) và tab "Báo cáo tự động".
// Dữ liệu dựng ở src/utils/reverseAutoReport.js; component này chỉ vẽ. % PUD không chặn 100% (xem pudRateOf).
const dayLabel = day => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fullDate = day => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

const SECTION_TITLES = {
  partner: 'Pickup done · Loại Hub',
  province: 'Pickup done · BC KD theo tỉnh',
  region: 'Pickup done · Nationwide theo vùng'
};

function PudSection({ section, dates }) {
  return (
    <section className="rar-panel" aria-label={SECTION_TITLES[section.key]}>
      <h2 className="rar-bar">{SECTION_TITLES[section.key]}</h2>
      <table className="rar-table">
        <thead>
          <tr>
            <th scope="col" className="rar-name">{section.rowHeader}</th>
            {dates.map(day => <th scope="col" key={day} className="rar-num">{dayLabel(day)}</th>)}
            <th scope="col" className="rar-num rar-volcol">Vol 7N</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map(row => (
            <tr key={row.key}>
              <th scope="row" className="rar-name">{row.label}</th>
              {row.cells.map((cell, i) => <td key={dates[i]} className="rar-num">{formatPct(cell.rate)}</td>)}
              <td className="rar-num rar-volcol">{formatVol(row.vol7)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rar-total">
            <th scope="row" className="rar-name">{section.total.label}</th>
            {section.total.cells.map((cell, i) => <td key={dates[i]} className="rar-num">{formatPct(cell.rate)}</td>)}
            <td className="rar-num rar-volcol">{formatVol(section.total.vol7)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function BacklogHead() {
  return (
    <thead>
      <tr>
        <th scope="col" className="rar-name">Kho</th>
        <th scope="col" className="rar-num">Gán 0</th>
        <th scope="col" className="rar-num">Gán 1–2</th>
        <th scope="col" className="rar-num">Gán ≥3</th>
        <th scope="col" className="rar-num">Tổng</th>
      </tr>
    </thead>
  );
}

function BacklogCells({ item }) {
  return (
    <>
      <td className="rar-num">{formatVol(item.g0)}</td>
      <td className="rar-num">{formatVol(item.g12)}</td>
      <td className="rar-num">{formatVol(item.g3)}</td>
      <td className="rar-num rar-strong">{formatVol(item.total)}</td>
    </>
  );
}

function BacklogPanel({ table }) {
  if (!table) {
    return (
      <section className="rar-panel rar-backlog" aria-label="Gán lấy BC KD">
        <h2 className="rar-bar">Gán lấy · BC KD theo kho</h2>
        <p className="rar-empty">Chưa có snapshot backlog Reverse.</p>
      </section>
    );
  }
  // Danh sách dài nên chia hai nửa cạnh nhau để tấm hình không cao gấp đôi cột trái.
  const half = Math.ceil(table.rows.length / 2);
  const columns = [table.rows.slice(0, half), table.rows.slice(half)];
  return (
    <section className="rar-panel rar-backlog" aria-label="Gán lấy BC KD">
      <h2 className="rar-bar">Gán lấy · BC KD theo kho<span className="rar-bar-meta">snapshot {fullDate(table.snapshotDate)}</span></h2>
      <dl className="rar-backlog-sum" aria-label={`Tổng BC KD ${table.hubCount} kho`}>
        <div><dt>Tổng BC KD</dt><dd>{table.hubCount} kho</dd></div>
        <div><dt>Gán 0</dt><dd>{formatVol(table.total.g0)}</dd></div>
        <div><dt>Gán 1–2</dt><dd>{formatVol(table.total.g12)}</dd></div>
        <div><dt>Gán ≥3</dt><dd>{formatVol(table.total.g3)}</dd></div>
        <div><dt>Tổng</dt><dd>{formatVol(table.total.total)}</dd></div>
      </dl>
      <div className="rar-backlog-cols">
        {columns.map((rows, index) => (
          <table className="rar-table" key={index}>
            <BacklogHead />
            <tbody>
              {rows.map(item => (
                <tr key={item.whId || item.name}>
                  <th scope="row" className="rar-name">{item.name}</th>
                  <BacklogCells item={item} />
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

export function ReverseReportSheet({ tables, backlog }) {
  const range = tables ? `${dayLabel(tables.dates[0])} → ${fullDate(tables.dates[tables.dates.length - 1])}` : '';
  return (
    <article className="rar-sheet" aria-label="Báo cáo tự động SPE Reverse">
      <div className="rar-sheet-grid">
        <div className="rar-left">
          {tables
            ? tables.sections.map(section => <PudSection key={section.key} section={section} dates={tables.dates} />)
            : <section className="rar-panel"><h2 className="rar-bar">Pickup done</h2><p className="rar-empty">Chưa có lịch sử Reverse.</p></section>}
        </div>
        <BacklogPanel table={backlog} />
      </div>
      <p className="rar-note">
        SPE Reverse{range && ` · ${range}`}. % PUD = đơn lấy thành công / đơn mới trong ngày, có thể vượt 100% vì gồm cả đơn tồn từ ngày trước;
        Vol 7N = tổng đơn mới trong 7 ngày; Khác = GXT, KHL và đơn chưa rõ vùng. Gán lấy: đơn chưa lấy thành công, cột Gán 0 / 1–2 / ≥3 lần,
        Tổng = cộng ba cột, chỉ tính đơn tồn ≤ 7 ngày.
      </p>
    </article>
  );
}
