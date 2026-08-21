// Dữ liệu mẫu cho tab Leadtime.
//
// Bản cũ sinh số bằng Math.sin/Math.cos — nhìn mượt nhưng không phản ánh gì, và
// tệ hơn: nó là default state của app nên khi Supabase chưa có dữ liệu thì người
// dùng đọc số bịa mà không hề biết (audit A1).
//
// Bản này là MẪU CẮT TỪ OUTPUT THẬT của shopee/leadtime_chang_deli.sql
// (3.616 dòng / 46 ngày / 167 tuyến / 7,15M đơn), giữ nguyên mọi edge case:
//  - đủ 5 lane kể cả Cross metro và Cross metro * (bản cũ hardcode 3 lane nên
//    2 lane này biến mất khỏi chart)
//  - 87 dòng lane rỗng (cả 3 cột from/to/lane trống)
//  - các dòng thiếu chặng (NULL prepickup / firstmile / middlemile)
//
// App vẫn phải hiện banner "dữ liệu mẫu" khi dùng nguồn này — số thật thì đúng
// nhưng chỉ là một phần tệp tuyến, không phải toàn mạng.
import sampleCsv from './leadtime-sample.csv?raw';

const NUMERIC_COLS = new Set([
  'mau',
  'avg_lt_prepickup_hour',
  'avg_lt_firstmile_hour',
  'avg_lt_middlemile_hour',
  'avg_lt_lastmile_hour',
  'avg_lt_e2e_hour'
]);

/**
 * Parser tối giản: file mẫu do chính repo sinh ra, không có dấu phẩy trong ô
 * nên không cần Papa. Ô rỗng -> null để phân biệt "không có mốc" với số 0.
 */
export function parseLeadtimeCsv(text) {
  const lines = String(text).replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  const rows = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const raw = cells[c];
      if (raw === undefined || raw === '') {
        row[key] = null;
      } else if (NUMERIC_COLS.has(key)) {
        const n = Number(raw);
        row[key] = Number.isFinite(n) ? n : null;
      } else {
        row[key] = raw;
      }
    }
    rows[i - 1] = row;
  }
  return rows;
}

export function createDefaultLeadtimeDataset() {
  return parseLeadtimeCsv(sampleCsv);
}
