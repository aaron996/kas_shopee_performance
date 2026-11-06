import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMarkdown, chatExportFilename } from './chatExport.js';

const messages = [
  { role: 'user', content: 'Vì sao D1ST giảm?\nHôm qua' },
  { role: 'assistant', content: '- **GXT - Nam** giảm 2,14 điểm %', sources: [
    { evidenceId: 'db_1', dataAsOf: '2026-11-05', visualization: { type: 'bar', title: '1st Delivery theo hub', metric: 'd1st',
      scope: { client: 'SPB', dateFrom: '2026-11-05', dateTo: '2026-11-05', grain: 'hub' }, points: [{ label: 'Kho A|B', value: 91.8, volume: 1200 }] } },
    { evidenceId: 'db_1', dataAsOf: '2026-11-05' }] }
];

test('exports Q&A as markdown with chart tables, escaped cells and data date', () => {
  const md = buildChatMarkdown(messages, new Date('2026-11-06T03:00:00Z'));
  assert.match(md, /^# Hội thoại Trợ lý KAS/);
  assert.match(md, /> Vì sao D1ST giảm\?\n> Hôm qua/);
  assert.match(md, /## 🤖 Trợ lý KAS\n\n- \*\*GXT - Nam\*\*/);
  assert.match(md, /\| Kho A\\\|B \| 91,8% \| 1\.200 \|/);
  assert.equal(md.match(/1st Delivery theo hub/g).length, 1);
  assert.match(md, /_Dữ liệu đến 2026-11-05\._/);
});

test('filename is timestamped markdown', () => {
  assert.match(chatExportFilename(new Date(2026, 10, 6, 9, 5)), /^kas-chat-20261106-0905\.md$/);
});
