import { ChatError } from './errors.js';

const readInt = (env, key, fallback, min, max) => {
  const raw = env[key];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ChatError('CHAT_CONFIG_INVALID', `Cấu hình ${key} không hợp lệ.`, 503);
  }
  return value;
};

const requireValue = (env, key) => {
  const value = env[key]?.trim();
  if (!value) throw new ChatError('CHAT_CONFIG_MISSING', `Chatbot chưa được cấu hình ${key}.`, 503);
  return value;
};

export function readChatConfig(env = process.env) {
  if (env.AI_CHAT_ENABLED !== 'true') {
    throw new ChatError('CHAT_DISABLED', 'Chatbot hiện chưa được bật.', 503);
  }

  const model = env.AI_CHAT_MODEL?.trim() || 'gpt-5.6-luna';
  if (model !== 'gpt-5.6-luna') {
    throw new ChatError('CHAT_CONFIG_INVALID', 'AI_CHAT_MODEL phải là gpt-5.6-luna trong v1.', 503);
  }

  return {
    openaiApiKey: requireValue(env, 'OPENAI_API_KEY'),
    model,
    reasoningEffort: env.AI_CHAT_REASONING_EFFORT?.trim() || 'low',
    supabaseUrl: requireValue(env, 'SUPABASE_URL'),
    supabaseAnonKey: requireValue(env, 'SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    orgId: env.AI_CHAT_ORG_ID?.trim() || 'ghn-kas',
    userDailyTurns: readInt(env, 'AI_CHAT_USER_DAILY_TURNS', 10, 1, 10000),
    orgDailyTurns: readInt(env, 'AI_CHAT_ORG_DAILY_TURNS', 600, 1, 1000000),
    userDailyMicrousd: readInt(env, 'AI_CHAT_USER_DAILY_MICROUSD', 500000, 1, 1000000000),
    orgDailyMicrousd: readInt(env, 'AI_CHAT_ORG_DAILY_MICROUSD', 5000000, 1, 10000000000),
    requestReserveMicrousd: readInt(env, 'AI_CHAT_REQUEST_RESERVE_MICROUSD', 25000, 1, 100000000),
    maxOutputTokens: readInt(env, 'AI_CHAT_MAX_OUTPUT_TOKENS', 2048, 256, 16384),
    modelTimeoutMs: readInt(env, 'AI_CHAT_MODEL_TIMEOUT_MS', 20000, 1000, 120000),
    turnTimeoutMs: readInt(env, 'AI_CHAT_TURN_TIMEOUT_MS', 90000, 5000, 300000)
  };
}
