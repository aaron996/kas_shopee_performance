import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicInformation, publicAnswer, publicCitations, publicSourceLinks, countBillableSearches } from './public-search.js';
import { usageRow } from './agent.js';

const config = { model: 'gpt-4.1', reasoningEffort: null, maxOutputTokens: 1024 };
const call = { name: 'search_public_information', arguments: JSON.stringify({ topic: 'ecommerce', query: 'Tin ecommerce quốc tế tuần này' }) };
const response = {
  status: 'completed', usage: { input_tokens: 100, output_tokens: 50 },
  output: [
    { type: 'web_search_call', action: { type: 'search' } },
    { type: 'web_search_call', action: { type: 'open_page' } },
    { type: 'message', content: [{ type: 'output_text', text: 'Tin công khai. cite', annotations: [
      { type: 'url_citation', url: 'https://example.com/news', title: 'Bản tin', start_index: 14, end_index: 18 }
    ] }] }
  ]
};

test('public research sends only the public question with bounded hosted web search and accounts for search cost', async () => {
  let body, options;
  const usage = [];
  const result = await searchPublicInformation(call, { config, now: new Date('2026-10-04T18:00:00Z'),
    openai: { responses: { async create(request, requestOptions) { body = request; options = requestOptions; return response; } } },
    onUsage: result => usage.push(result),
    // Extra caller fields must never be forwarded to the search model.
    history: [{ content: 'Private COD history' }], screenContext: { client: 'SPB', regions: ['HCM'] }, userClient: { secret: true }
  });
  assert.deepEqual(JSON.parse(body.input[0].content), { topic: 'ecommerce', query: 'Tin ecommerce quốc tế tuần này' });
  assert.doesNotMatch(JSON.stringify(body), /Private COD history|HCM|secret/);
  assert.match(body.instructions, /2026-10-05/);
  assert.equal(body.tools[0].type, 'web_search');
  assert.equal(body.tools[0].search_context_size, 'low');
  assert.equal(body.tool_choice, 'required');
  assert.equal(body.max_tool_calls, 2);
  assert.equal(body.store, false);
  assert.equal(body.reasoning, undefined);
  assert.equal(options.signal, undefined);
  assert.equal(result.data.available, true);
  assert.match(result.data.answer, /\[Bản tin\]\(https:\/\/example.com\/news\)/);
  assert.deepEqual(usage, [response]);
  assert.equal(countBillableSearches(response), 1, 'opening a page is not a search fee');
  assert.equal(usageRow(response, 1, 'gpt-4.1', null, ['web_search'], 100).estimatedMicrousd, 10600);
});

test('no verified citations, incomplete response, disabled search and provider failure remain unavailable', async () => {
  for (const output of [{ ...response, output: [] }, { ...response, status: 'incomplete' }]) {
    const result = await searchPublicInformation(call, { config, openai: { responses: { create: async () => output } } });
    assert.equal(result.data.available, false);
    assert.equal(result.data.answer, undefined);
  }
  let calls = 0;
  const openai = { responses: { async create() { calls++; throw new Error('unsupported model'); } } };
  assert.equal((await searchPublicInformation(call, { config: { ...config, webSearchEnabled: false }, openai })).data.reason, 'search_disabled');
  assert.equal(calls, 0);
  assert.equal((await searchPublicInformation(call, { config, openai })).data.reason, 'provider_unavailable');
});

test('invalid topics, private identifiers and internal search requests are rejected before any web call', async () => {
  const openai = { responses: { create: async () => { throw new Error('must not call'); } } };
  for (const args of [
    { topic: 'politics', query: 'x' }, { topic: 'logistics', query: 'tra cứu test@ghn.vn' },
    { topic: 'logistics', query: 'tra cứu mã đơn ABC' }, { topic: 'ai', query: 'SMS scoring của app tính ra sao' },
    { topic: 'ai', query: 'service_role key' }, { topic: 'ecommerce', query: '0901234567' },
    { topic: 'ai', query: 'RAG', history: 'private' }
  ]) {
    const result = await searchPublicInformation({ ...call, arguments: JSON.stringify(args) }, { config, openai });
    assert.equal(result.data.available, false);
    assert.notEqual(result.data.reason, 'provider_unavailable');
  }
});

test('web citation conversion rejects unsafe links and does not corrupt multiple inline offsets', () => {
  const result = { output: [{ content: [{ type: 'output_text', text: 'A [1] B [2]', annotations: [
    { type: 'url_citation', url: 'https://example.com/a(x)', title: '[A]', start_index: 2, end_index: 5 },
    { type: 'url_citation', url: 'https://example.com/b', title: 'B', start_index: 8, end_index: 11 },
    { type: 'url_citation', url: 'javascript:alert(1)', title: 'bad' },
    { type: 'url_citation', url: 'https://user:password@example.com/', title: 'bad' }
  ] }] }] };
  assert.equal(publicCitations(result).length, 2);
  assert.equal(publicAnswer(result), 'A [A](https://example.com/a%28x%29) B [B](https://example.com/b)');
  assert.doesNotMatch(publicSourceLinks(publicCitations(result)), /javascript|password/);
});

test('a cancelled public research request propagates cancellation instead of fabricating an answer', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchPublicInformation(call, { config, signal: controller.signal,
    openai: { responses: { create: async () => { throw new Error('cancelled'); } } }
  }), /cancelled/);
});
