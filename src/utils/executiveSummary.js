// "Nhận xét D-1": D-1 vs the same weekday a week earlier, plus the 3 vùng
// with the most late orders on D-1 (orders not on time for 1st Pickup /
// 1st Deli — absolute count, not the lowest %, so a tiny vùng with a few
// late orders doesn't outrank the big ones). Shown in ExecutiveSummaryModal and sent
// as-is by the n8n daily Telegram report (api/snapshot-summary.js), so both
// always say the same thing.
import { getWeekdayName } from './dataProcessor.js';

const num = (value) => Number(value) || 0;

const PICK_METRICS = {
  title: 'Lấy hàng',
  total: r => num(r.mau_pu),
  first: { label: '1st Pickup', short: '1st', ontime: r => num(r.ontime_pu_1st) },
  second: { label: 'OPR', short: 'OPR', ontime: r => num(r.ontime_pu_opr) }
};

const DELI_METRICS = {
  title: 'Giao hàng',
  total: r => num(r.mau_deli ?? r.mau_del),
  first: { label: '1st Deli', short: '1st', ontime: r => num(r.ontime_deli_1st ?? r.ontime_del_1st) },
  second: { label: 'ODR', short: 'ODR', ontime: r => num(r.ontime_deli_odr ?? r.ontime_del_odr) }
};

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(dateStr) {
  return `${getWeekdayName(dateStr)} ${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

const pct = (ontime, total) => (total > 0 ? (ontime / total) * 100 : null);

// D-1 is the latest day that actually has volume. Deliveries are never due on
// Sunday, so on Monday the deli D-1 falls back to Saturday instead of
// comparing an empty Sunday with the previous empty Sunday.
function buildSection(rows, metrics) {
  const byDate = new Map();
  rows.forEach(r => {
    const date = String(r.report_date || '').slice(0, 10);
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(r);
  });
  const activeDates = [...byDate.keys()]
    .filter(date => byDate.get(date).some(r => metrics.total(r) > 0))
    .sort();
  const d1 = activeDates[activeDates.length - 1];
  if (!d1) return null;
  const prev = addDays(d1, -7);

  const totals = (date) => {
    const dayRows = byDate.get(date) || [];
    const total = dayRows.reduce((s, r) => s + metrics.total(r), 0);
    return {
      first: pct(dayRows.reduce((s, r) => s + metrics.first.ontime(r), 0), total),
      second: pct(dayRows.reduce((s, r) => s + metrics.second.ontime(r), 0), total)
    };
  };

  const regions = new Map();
  byDate.get(d1).forEach(r => {
    const reg = regions.get(r.region) || { total: 0, first: 0, second: 0 };
    reg.total += metrics.total(r);
    reg.first += metrics.first.ontime(r);
    reg.second += metrics.second.ontime(r);
    regions.set(r.region, reg);
  });
  const worst = [...regions.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([region, v]) => ({ region, late: v.total - v.first, first: pct(v.first, v.total), second: pct(v.second, v.total) }))
    .sort((a, b) => b.late - a.late || a.first - b.first)
    .slice(0, 3);

  return { metrics, d1, prev, current: totals(d1), previous: byDate.has(prev) ? totals(prev) : null, worst };
}

export function buildExecutiveSummary(pickRows = [], deliRows = [], clientFilter = 'SPB') {
  const byClient = rows => (clientFilter === 'ALL' ? rows : rows.filter(r => r.client_name === clientFilter));
  const pick = buildSection(byClient(pickRows || []), PICK_METRICS);
  const deli = buildSection(byClient(deliRows || []), DELI_METRICS);
  if (!pick && !deli) return null;
  return { client: clientFilter, sections: [pick, deli].filter(Boolean) };
}

const fmtPct = (v) => (v === null || v === undefined ? '–' : `${v.toFixed(1)}%`);

function trend(current, previous) {
  if (current === null || previous === null || previous === undefined) return 'không đủ dữ liệu để so sánh';
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) return `tăng ${diff.toFixed(1)}%`;
  if (diff < 0) return `giảm ${Math.abs(diff).toFixed(1)}%`;
  return 'không đổi';
}

// `strong` wraps the parts Telegram shows in bold; `text` escapes the rest.
function renderSummary(summary, { strong, text }) {
  const compareLabel = (s) => `(${dayLabel(s.d1)}) so với cùng thứ tuần trước (${dayLabel(s.prev)})`;
  const sameDay = summary.sections.every(s => s.d1 === summary.sections[0].d1);
  const clientSuffix = summary.client === 'ALL' ? '' : ` — ${summary.client}`;

  const lines = [sameDay
    ? `${strong('Nhận xét D-1')} ${text(`${compareLabel(summary.sections[0])}${clientSuffix}`)}`
    : `${strong('Nhận xét D-1')}${text(clientSuffix)}`];

  summary.sections.forEach((s, index) => {
    const { metrics, current, previous } = s;
    if (index > 0) lines.push('');
    lines.push(sameDay ? strong(metrics.title) : `${strong(metrics.title)} ${text(compareLabel(s))}`);
    for (const key of ['first', 'second']) {
      const prevValue = previous ? previous[key] : null;
      lines.push(text(`• ${metrics[key].label}: `) + strong(fmtPct(current[key])) + text(` so ${fmtPct(prevValue)} → ${trend(current[key], prevValue)}`));
    }
    lines.push(text(`Top vùng trễ ${metrics.first.label} nhiều nhất (D-1):`));
    s.worst.forEach(r => {
      lines.push(text('• ') + strong(r.region) + text(`: ${r.late.toLocaleString('vi-VN')} đơn trễ | ${metrics.first.short} ${fmtPct(r.first)} | ${metrics.second.short} ${fmtPct(r.second)}`));
    });
  });
  return lines.join('\n');
}

export function formatExecutiveSummary(summary) {
  if (!summary) return 'Chưa có dữ liệu để tổng hợp.';
  return renderSummary(summary, { strong: s => s, text: s => s });
}

// Telegram legacy Markdown (the n8n "Send Nhan Xet" node uses parse_mode Markdown).
const escapeMarkdown = (s) => String(s).replace(/([_*`[])/g, '\\$1');

export function formatExecutiveSummaryMarkdown(summary) {
  if (!summary) return 'Chưa có dữ liệu để tổng hợp.';
  return renderSummary(summary, { strong: s => `*${escapeMarkdown(s)}*`, text: escapeMarkdown });
}
