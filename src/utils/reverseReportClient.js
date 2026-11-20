import { supabase } from './supabaseClient.js';
import { unpackRows } from './snapshotView.js';
import { buildPudTables, buildBacklogTable } from './reverseAutoReport.js';

// Dữ liệu của tab "Báo cáo tự động": cùng payload với ảnh /snapshot (history + backlog), đọc qua
// /api/snapshot-summary?view=reverse-report bằng phiên đăng nhập. Bảng gốc không có quyền SELECT cho authenticated.
export function buildReverseReportModel(payload) {
  const history = unpackRows(payload?.history);
  const tables = buildPudTables(history);
  const backlog = buildBacklogTable(unpackRows(payload?.backlog), history);
  return { tables: tables.dates.length ? tables : null, backlog: backlog || null };
}

export async function fetchReverseReport(signal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch('/api/snapshot-summary?view=reverse-report', {
    headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' }, signal
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || 'Không tải được báo cáo Reverse.');
  return buildReverseReportModel(payload);
}
