// Optional live evaluation; invokes OpenAI and can incur model/web tool charges.
// Run: node --env-file=.env.local scripts/chat-scope-eval.mjs --live [case-id]
// Output is a review artifact, not an automatic claim that the model passed.
import { resolveModelSelection } from '../server/chat/config.js';
import { runChatAgent } from '../server/chat/agent.js';
import { CONVERSATION_CASES } from '../server/chat/conversation-cases.js';

if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ live: false, cases: CONVERSATION_CASES }, null, 2));
} else {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for live evaluation.');
  const caseId = process.argv.slice(2).find(value => value !== '--live');
  const cases = caseId ? CONVERSATION_CASES.filter(item => item.id === caseId) : CONVERSATION_CASES;
  if (!cases.length) throw new Error('Unknown evaluation case.');
  const config = {
    ...resolveModelSelection(process.env.AI_CHAT_MODEL || 'gpt-5.6-luna', process.env.AI_CHAT_REASONING_EFFORT),
    openaiApiKey: process.env.OPENAI_API_KEY, modelTimeoutMs: 20000, maxOutputTokens: 2048,
    webSearchEnabled: process.env.AI_CHAT_WEB_SEARCH_ENABLED !== 'false'
  };
  for (const item of cases) {
    let answer = '', interaction = null;
    try {
      const result = await runChatAgent({ config, request: { question: item.question, history: [],
        screenContext: { activeTab: 'cod-suspicion', client: 'SPB', regions: ['HCM'], hubTypes: ['LM'] } },
        userClient: null, onText: text => { answer += text; }, onInteraction: value => { interaction = value; }
      });
      console.log(JSON.stringify({ id: item.id, expected: item.expected, answer, interaction,
        tools: result.toolNames, estimatedMicrousd: result.actualMicrousd, needsHumanReview: true }));
    } catch (error) {
      console.log(JSON.stringify({ id: item.id, expected: item.expected, answer, error: error.code || 'EVAL_FAILED', needsHumanReview: true }));
    }
  }
}
