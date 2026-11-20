import React from 'react';
import { formatPct, formatVol } from '../../utils/dataProcessor.js';
import './reverseReport.css';

// Ba bảng của báo cáo tự động SPE Reverse. Dùng chung cho ảnh /snapshot (n8n gửi Telegram) và tab "Báo cáo tự động".
// Dữ liệu dựng ở src/utils/reverseAutoReport.js; component này chỉ vẽ. LTC không chặn 100% (xem ltcOf).
const dayLabel = day => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fullDate = day => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

function MatrixTable({ title, note, tables, cellText, ariaLabel }) {
  return (
    <section className="rar-card" aria-label={ariaLabel}>
      <h2 className="rar-title">{title}</h2>
      <table className="rar-table">
        <thead>
          <tr>
            <th scope="col" className="rar-name">Nhóm</th>
            {tables.dates.map(day => <th scope="col" key={day} className="rar-num">{dayLabel(day)}</th>)}
          </tr>
        </thead>
        <tbody>
          {tables.rows.map(row => (
            <tr key={row.key} className={`rar-row rar-${row.kind}`}>
              <th scope="row" className="rar-name">{row.label}</th>
              {row.cells.map((cell, i) => <td key={tables.dates[i]} className="rar-num">{cellText(cell)}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rar-row rar-total">
            <th scope="row" className="rar-name">{tables.total.label}</th>
            {tables.total.cells.map((cell, i) => <td key={tables.dates[i]} className="rar-num">{cellText(cell)}</td>)}
          </tr>
        </tfoot>
      </table>
      <p className="rar-note">{note}</p>
    </section>
  );
}

export function ReverseLtcTable({ tables }) {
  return (
    <MatrixTable
      ariaLabel="LTC SPE Reverse"
      title={`LTC lấy thành công (%) · ${fullDate(tables.dates[0])} → ${fullDate(tables.dates[tables.dates.length - 1])}`}
      note="LTC = đơn lấy thành công / đơn mới trong ngày. Có thể vượt 100% vì số lấy thành công gồm cả đơn tồn từ ngày trước. AHM và BCKD nằm trong các vùng."
      tables={tables}
      cellText={cell => formatPct(cell.ltc)}
    />
  );
}

export function ReverseVolTable({ tables }) {
  return (
    <MatrixTable
      ariaLabel="Volume SPE Reverse"
      title={`Vol đơn mới/ngày · ${fullDate(tables.dates[0])} → ${fullDate(tables.dates[tables.dates.length - 1])}`}
      note="Vol = số đơn mới trong ngày (mẫu của LTC). AHM và BCKD nằm trong các vùng, dòng Tổng không cộng đôi."
      tables={tables}
      cellText={cell => formatVol(cell.vol)}
    />
  );
}

export function ReverseBacklogTable({ table }) {
  const row = (item, className) => (
    <tr key={item.whId || item.name} className={className}>
      <th scope="row" className="rar-name">{item.name}</th>
      <td className="rar-num">{formatVol(item.g0)}</td>
      <td className="rar-num">{formatVol(item.g12)}</td>
      <td className="rar-num">{formatVol(item.g3)}</td>
      <td className="rar-num rar-strong">{formatVol(item.l7)}</td>
      <td className="rar-num rar-strong">{formatVol(item.l14)}</td>
    </tr>
  );
  const rest = table.hubCount - table.rows.length;
  return (
    <section className="rar-card" aria-label="Backlog BCKD SPE Reverse">
      <h2 className="rar-title">BCKD · tồn theo số lần gán lấy &amp; backlog tuyệt đối · snapshot {fullDate(table.snapshotDate)}</h2>
      <table className="rar-table">
        <thead>
          <tr>
            <th scope="col" className="rar-name">Kho</th>
            <th scope="col" className="rar-num">0 lần</th>
            <th scope="col" className="rar-num">1–2 lần</th>
            <th scope="col" className="rar-num">≥3 lần</th>
            <th scope="col" className="rar-num">L7D</th>
            <th scope="col" className="rar-num">L14D</th>
          </tr>
        </thead>
        <tbody>{table.rows.map(item => row(item, 'rar-row'))}</tbody>
        <tfoot>{row({ name: `Tổng BCKD (${table.hubCount} kho)`, whId: 'total', ...table.total }, 'rar-row rar-total')}</tfoot>
      </table>
      <p className="rar-note">
        Đơn chưa lấy thành công. Cột 0 / 1–2 / ≥3 lần gán và L7D chỉ tính đơn tồn ≤ 7 ngày; L14D là backlog tuyệt đối cả cửa sổ 14 ngày.
        {rest > 0 && ` Hiện ${table.rows.length} kho tồn nhiều nhất, còn ${rest} kho nằm trong dòng Tổng.`}
      </p>
    </section>
  );
}
