import { ChatError } from './errors.js';

/**
 * Legacy defaults used only when the model registry migration is absent.
 */
export const ALLOWED_MODELS = [
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'low'
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'low'
  },
  {
    id: 'o4-mini',
    label: 'o4-mini',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'low'
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    reasoningEfforts: [],
    defaultReasoningEffort: null
  }
];

export function readEnvironmentModel(model, requestedReasoningEffort) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model)) {
    throw new ChatError('CHAT_CONFIG_INVALID', 'Model ID trong biến môi trường không hợp lệ.', 503);
  }
  const reasoningEffort = requestedReasoningEffort || ALLOWED_MODELS.find(m => m.id === model)?.defaultReasoningEffort || null;
  if (reasoningEffort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoningEffort)) {
    throw new ChatError('CHAT_CONFIG_INVALID', 'Reasoning trong biến môi trường không hợp lệ.', 503);
  }
  // Model enablement and its supported efforts are checked against the database
  // after authentication, before any provider request.
  return { model, reasoningEffort };
}

export function resolveModelSelection(model, requestedReasoningEffort, allowedModels = ALLOWED_MODELS) {
  const modelConfig = allowedModels.find(candidate => candidate.id === model);
  if (!modelConfig) {
    throw new ChatError('CHAT_MODEL_NOT_ALLOWED', `Model "${model}" không nằm trong danh sách hỗ trợ.`, 400);
  }

  if (modelConfig.reasoningEfforts.length === 0) {
    if (requestedReasoningEffort) {
      throw new ChatError('CHAT_REASONING_NOT_SUPPORTED', `${modelConfig.label} không hỗ trợ reasoning effort.`, 400);
    }
    return { model, reasoningEffort: null };
  }

  const reasoningEffort = requestedReasoningEffort || modelConfig.defaultReasoningEffort;
  if (!modelConfig.reasoningEfforts.includes(reasoningEffort)) {
    throw new ChatError(
      'CHAT_REASONING_NOT_ALLOWED',
      `Reasoning effort "${reasoningEffort}" không được hỗ trợ cho ${modelConfig.label}.`,
      400
    );
  }

  return { model, reasoningEffort };
}

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
  let modelSelection;
  try {
    modelSelection = readEnvironmentModel(model, env.AI_CHAT_REASONING_EFFORT?.trim());
  } catch (error) {
    throw new ChatError('CHAT_CONFIG_INVALID', error.message, 503, { cause: error });
  }

  return {
    openaiApiKey: requireValue(env, 'OPENAI_API_KEY'),
    ...modelSelection,
    allowedModels: ALLOWED_MODELS,
    supabaseUrl: requireValue(env, 'SUPABASE_URL'),
    supabaseAnonKey: requireValue(env, 'SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    // Set AI_CHAT_SUGGESTIONS_MODEL=false to keep data-driven suggestions but skip the model rewrite.
    suggestionModelEnabled: env.AI_CHAT_SUGGESTIONS_MODEL !== 'false',
    orgId: env.AI_CHAT_ORG_ID?.trim() || 'ghn-kas',
    webSearchEnabled: env.AI_CHAT_WEB_SEARCH_ENABLED !== 'false',
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
