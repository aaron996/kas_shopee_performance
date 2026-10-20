import test from 'node:test';
import assert from 'node:assert/strict';
import { getComposerQuestion, toAssistantUiMessages } from './chatAssistantUi.js';

test('streaming and completed turns keep message identity and GHN metadata', () => {
  const interaction = { prompt: 'Chọn kỳ báo cáo', selection: 'Tháng 10' };
  const sources = [{ scope: { client: 'SPB' }, evidenceId: 'private-evidence-id' }];
  const pending = { id: 'turn', question: 'ODR?', answer: 'Đang trả lời', sources, interaction };
  const streaming = toAssistantUiMessages([], pending, null);
  assert.deepEqual(streaming.map(m => m.id), ['turn-user', 'turn-assistant']);
  assert.equal(streaming[1].status.type, 'running');
  assert.equal(streaming[1].metadata.custom.isPending, true);
  const completed = toAssistantUiMessages([
    { id: 'turn-user', role: 'user', content: pending.question },
    { id: 'turn-assistant', role: 'assistant', content: pending.answer, sources, interaction },
  ], null, null);
  assert.deepEqual(completed.map(m => m.id), streaming.map(m => m.id));
  assert.equal(completed[1].metadata.custom.interaction, interaction);
  assert.equal(completed[1].metadata.custom.sources, sources);
  assert.equal(completed[1].metadata.custom.messageIndex, 1);
  assert.equal(completed[1].status.type, 'complete');
});

test('waiting stays empty for shimmer; interaction prompt becomes the message text', () => {
  const pending = { id: 'turn', question: 'KPI?', answer: '' };
  assert.deepEqual(toAssistantUiMessages([], pending, null)[1].content, []);
  pending.interaction = { prompt: 'Chọn dữ liệu' };
  assert.deepEqual(toAssistantUiMessages([], pending, null)[1].content, [{ type: 'text', text: 'Chọn dữ liệu' }]);
});

test('failed question appears once and is replaced by retry; stopped answer keeps metadata', () => {
  const failed = { id: 'failed', displayQuestion: 'Câu hỏi lỗi' };
  assert.equal(toAssistantUiMessages([], null, failed).length, 1);
  assert.equal(toAssistantUiMessages([], { id: 'retry', question: failed.displayQuestion, answer: '' }, failed).length, 2);
  const stopped = toAssistantUiMessages([{ id: 'stopped', role: 'assistant', content: 'Một phần', stopped: true }], null, null);
  assert.equal(stopped[0].metadata.custom.stopped, true);
});

test('composer sends only text and preserves line breaks', () => {
  assert.equal(getComposerQuestion({ content: [{ type: 'text', text: 'Dòng 1' }, { type: 'image', image: 'ignored' }, { type: 'text', text: 'Dòng 2' }] }), 'Dòng 1\nDòng 2');
});
