// Run with: node --env-file=D:/Github/GHN/.env.local scripts/chat-smoke.mjs
// Uses a SQL-verified fixture for the model loop; does not impersonate a user.
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
  request: { question: 'ODR SPB toàn quốc ngày 2026-09-07 là bao nhiêu? Dùng get_metric_summary để lấy số liệu.', history: [] },
  userClient: null,
  onText: delta => { answer += delta; }
}, {
  executeTool: async call => {
    if (call.name !== 'get_metric_summary') throw new Error('Smoke fixture only supports metric summary');
    const args = JSON.parse(call.arguments);
    if (args.metric !== 'odr' || args.client !== 'SPB' || args.date_from !== '2026-09-07' || args.date_to !== '2026-09-07' || args.grain !== 'nationwide') throw new Error('Unexpected metric scope');
    return { evidenceId: 'smoke_sql_verified', data: {
      metric: 'odr', scope: { client: 'SPB', dateFrom: '2026-09-07', dateTo: '2026-09-07', grain: 'nationwide' },
      dataAsOf: '2026-09-07', syncedAt: '2026-09-08T01:47:46.687585+00:00',
      rows: [{ value: 92.06, entity: 'Toàn quốc', ontime: 92047, volume: 99988 }]
    } };
  }
});
console.log(JSON.stringify({ check: 'live_luna_with_sql_verified_fixture', answer, toolNames: result.toolNames, usage: result.usage, estimatedMicrousd: result.actualMicrousd }));
