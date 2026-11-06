import { CHAT_METRIC_LABELS } from './chatChart.js';

const pct = value => (typeof value === 'number' ? `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%` : '—');
const int = value => (typeof value === 'number' ? value.toLocaleString('vi-VN') : '—');
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

function chartTable(chart) {
  const rows = chart.points.map(point => `| ${cell(point.label)} | ${pct(point.value)} | ${int(point.volume)} |`);
  const first = chart.type === 'line' ? 'Ngày' : chart.scope?.grain === 'hub' ? 'Hub' : 'Vùng';
  return [`**${cell(chart.title)}** (${chart.scope?.client ?? ''}, ${chart.scope?.dateFrom} → ${chart.scope?.dateTo})`,
    '', `| ${first} | ${CHAT_METRIC_LABELS[chart.metric] ?? chart.metric} | Sản lượng |`, '| --- | ---: | ---: |', ...rows].join('\n');
}

export function buildChatMarkdown(messages, now = new Date()) {
  const stamp = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const out = ['# Hội thoại Trợ lý KAS', '', `Xuất lúc: ${stamp}`, ''];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push('## 🧑 Câu hỏi', '', message.content.split('\n').map(line => `> ${line}`).join('\n'), '');
    } else if (message.role === 'assistant') {
      out.push('## 🤖 Trợ lý KAS', '', message.content, '');
      const seen = new Set();
      for (const source of message.sources ?? []) {
        if (!source.visualization || seen.has(source.evidenceId)) continue;
        seen.add(source.evidenceId);
        out.push(chartTable(source.visualization), '');
      }
      const asOf = (message.sources ?? []).map(source => source.dataAsOf).filter(Boolean).sort().at(-1);
      if (asOf) out.push(`_Dữ liệu đến ${asOf}._`, '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export function chatExportFilename(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `kas-chat-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.md`;
}
