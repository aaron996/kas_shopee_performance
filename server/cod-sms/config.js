import { resolveModelSelection } from '../chat/config.js';
import { ChatError } from '../chat/errors.js';

const DEFAULT_RUBRIC_VERSION = 'sms-rubric-2026-09-19-v1';

function requireValue(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new ChatError('COD_SMS_CONFIG_MISSING', `Chưa cấu hình ${key} cho pipeline SMS.`, 503);
  }
  return value;
}

function readInt(env, key, fallback, min, max) {
  const raw = env[key];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ChatError('COD_SMS_CONFIG_INVALID', `Cấu hình ${key} không hợp lệ.`, 503);
  }
  return value;
}

export function readCodSmsConfig(env = process.env, options = {}) {
  const requireScoring = options.requireScoring !== false;
  const enabled = env.COD_SMS_AI_ENABLED === 'true';
  if (requireScoring && !enabled) {
    throw new ChatError('COD_SMS_DISABLED', 'Pipeline chấm điểm SMS hiện chưa được bật.', 503);
  }

  const baseConfig = {
    enabled,
    supabaseUrl: requireValue(env, 'SUPABASE_URL'),
    supabaseAnonKey: requireValue(env, 'SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY')
  };
  if (!requireScoring) return baseConfig;

  const model = env.COD_SMS_AI_MODEL?.trim() || 'gpt-5.6-luna';
  let modelSelection;
  try {
    modelSelection = resolveModelSelection(model, env.COD_SMS_AI_REASONING_EFFORT?.trim() || 'low');
  } catch (error) {
    throw new ChatError('COD_SMS_CONFIG_INVALID', error.message, 503, { cause: error });
  }

  const maxBatchLimit = readInt(env, 'COD_SMS_AI_MAX_BATCH_LIMIT', 200, 1, 500);
  const defaultBatchLimit = readInt(env, 'COD_SMS_AI_BATCH_LIMIT', 25, 1, maxBatchLimit);

  return {
    ...baseConfig,
    openaiApiKey: requireValue(env, 'OPENAI_API_KEY'),
    ...modelSelection,
    rubricVersion: env.COD_SMS_AI_RUBRIC_VERSION?.trim() || DEFAULT_RUBRIC_VERSION,
    defaultBatchLimit,
    maxBatchLimit,
    maxOutputTokens: readInt(env, 'COD_SMS_AI_MAX_OUTPUT_TOKENS', 1200, 256, 4096),
    modelTimeoutMs: readInt(env, 'COD_SMS_AI_MODEL_TIMEOUT_MS', 30000, 1000, 120000),
    pendingStaleSeconds: readInt(env, 'COD_SMS_AI_PENDING_STALE_SECONDS', 900, 60, 86400)
  };
}

export { DEFAULT_RUBRIC_VERSION };
