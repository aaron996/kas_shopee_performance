// Run with: node --env-file=D:/Github/GHN/.env.local scripts/chat-smoke.mjs
// Uses a deterministic fixture for the model loop; does not impersonate a user or read production rows.
import { createClient } from '@supabase/supabase-js';
import { readChatConfig } from '../server/chat/config.js';
import { runChatAgent } from '../server/chat/agent.js';
const config = readChatConfig({ ...process.env, AI_CHAT_ENABLED: 'true' });
const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false } });
const denial = await anon.rpc('get_ai_chat_coverage', { p_dataset: 'deli', p_client: 'SPB' });
console.log(JSON.stringify({ check: 'anonymous_rpc_denied', passed: !!denial.error, code: denial.error?.code }));
let answer = '';
const result = await runChatAgent({
  config,
  request: { question: 'ODR SPB thì vùng nào đang tệ nhất?', history: [] },
  userClient: null,
  onText: delta => { answer += delta; }
}, {
  executeTool: async call => {
    if (call.name !== 'get_latest_metric_summary') throw new Error('Expected latest metric summary');
    const args = JSON.parse(call.arguments);
    if (args.metric !== 'odr' || args.client !== 'SPB' || args.grain !== 'region' || args.sort !== 'worst') throw new Error('Unexpected inferred metric scope');
    return { evidenceId: 'smoke_natural_language_fixture', data: {
      metric: 'odr', scope: { client: 'SPB', dateFrom: '2026-09-07', dateTo: '2026-09-07', grain: 'region' },
      dataAsOf: '2026-09-07', syncedAt: '2026-09-08T01:47:46.687585+00:00',
      rows: [{ value: 88.5, entity: 'Vùng kiểm thử', ontime: 885, volume: 1000 }]
    } };
  }
});
console.log(JSON.stringify({ check: 'live_luna_natural_language_fixture', answer, toolNames: result.toolNames, usage: result.usage, estimatedMicrousd: result.actualMicrousd }));
