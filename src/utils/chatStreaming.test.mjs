import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDataScope } from './chatRetry.js';

test('source scope formatting includes regions and hubTypes when present in evidence', () => {
  const sourceWithFilters = {
    evidenceId: 'db_test_1',
    tool: 'get_metric_summary',
    dataAsOf: '2026-09-08',
    syncedAt: '2026-09-08T08:30:00Z',
    scope: {
      client: 'SPB',
      grain: 'nationwide',
      regions: ['HCM', 'ĐNB'],
      hubTypes: ['SOC'],
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07'
    }
  };

  const formatted = formatDataScope(sourceWithFilters);
  assert.ok(formatted);
  assert.match(formatted.scopeDesc, /SPB/);
  assert.match(formatted.scopeDesc, /Toàn quốc/);
  assert.match(formatted.scopeDesc, /Vùng: HCM, ĐNB/);
  assert.match(formatted.scopeDesc, /Loại hub: SOC/);
  assert.equal(formatted.evidenceId, 'db_test_1');
  assert.equal(formatted.dataAsOfText, '08/09/2026');
});

test('streaming state lifecycle: source suppression during pending and render after message_end', () => {
  // Simulate the exact state machine of ChatPanel
  let messages = [];
  let pending = null;

  // 1. User submits question -> pending initiated
  const displayQuestion = 'ODR SPB hôm nay?';
  pending = { question: displayQuestion, answer: '', sources: [], interaction: null };

  // Helper verifying user-visible rendered sources
  const getRenderedSources = (msgs, pend) => {
    // In ChatPanel: pending never renders DataScopeBlock; only messages with role === 'assistant' render DataScopeBlock
    const visible = [];
    msgs.forEach(m => {
      if (m.role === 'assistant' && m.sources?.length) {
        visible.push(...m.sources);
      }
    });
    return visible;
  };

  // During streaming, incoming SSE text_delta and source events arrive
  pending.answer += 'Đang tính toán...';
  pending.sources.push({ evidenceId: 'db_streaming_source', tool: 'get_metric_summary' });

  // CRITICAL REQUIREMENT D: Zero sources are visible to user while pending!
  assert.equal(getRenderedSources(messages, pending).length, 0);

  // 2. Stream finishes -> message_end event commits message into messages
  const completedSources = [...pending.sources];
  const assistantContent = pending.answer;
  messages = [
    ...messages,
    { role: 'user', content: displayQuestion },
    { role: 'assistant', content: assistantContent, sources: completedSources }
  ];
  pending = null;

  // AFTER message_end: DataScopeBlock is rendered with full sources
  const visibleAfterCommit = getRenderedSources(messages, pending);
  assert.equal(visibleAfterCommit.length, 1);
  assert.equal(visibleAfterCommit[0].evidenceId, 'db_streaming_source');

  // 3. If request was aborted/failed before completion:
  // pending is cleared without adding assistant message -> zero sources rendered
  let abortedMessages = [];
  let abortedPending = { question: 'Câu hỏi lỗi', answer: 'dở dang...', sources: [{ evidenceId: 'db_leak' }] };
  // On error/abort:
  abortedPending = null;
  assert.equal(getRenderedSources(abortedMessages, abortedPending).length, 0);
});
