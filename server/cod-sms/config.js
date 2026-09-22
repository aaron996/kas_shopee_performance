import { ALLOWED_MODELS, resolveModelSelection } from '../chat/config.js';
import { resolveEffectiveChatConfig } from '../chat/model-config.js';
import { ChatError } from '../chat/errors.js';

const COD_SMS_MODEL_FEATURE = 'cod_sms';

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

/**
 * The COD SMS scoring env-var default (COD_SMS_AI_MODEL/COD_SMS_AI_REASONING_EFFORT),
 * exposed with `allowedModels` so it can serve as the fallback `baseConfig` for
 * resolveEffectiveChatConfig — mirrors how readChatConfig() feeds the chat feature.
 */
export function readCodSmsModelEnvDefault(env = process.env) {
  const model = env.COD_SMS_AI_MODEL?.trim() || 'gpt-5.6-luna';
  const reasoningEffort = env.COD_SMS_AI_REASONING_EFFORT?.trim() || 'low';
  let modelSelection;
  try {
    modelSelection = resolveModelSelection(model, reasoningEffort);
  } catch (error) {
    throw new ChatError('COD_SMS_CONFIG_INVALID', error.message, 503, { cause: error });
  }
  return { ...modelSelection, allowedModels: ALLOWED_MODELS };
}

/**
 * Resolves the effective COD SMS scoring model, precedence:
 *   1. Dev Admin override (ai_chat_model_config, feature='cod_sms', scope_type='all')
 *   2. COD_SMS_AI_MODEL / COD_SMS_AI_REASONING_EFFORT env vars
 * COD SMS scoring is a background job, not a per-user session, so unlike chat
 * there is no 'user' scope — only 'all'.
 */
export async function resolveCodSmsModelConfig(serviceClient, env = process.env) {
  const envDefault = readCodSmsModelEnvDefault(env);
  const effective = await resolveEffectiveChatConfig(serviceClient, envDefault, null, {
    feature: COD_SMS_MODEL_FEATURE
  });
  return { model: effective.model, reasoningEffort: effective.reasoningEffort };
}

export { DEFAULT_RUBRIC_VERSION, COD_SMS_MODEL_FEATURE };
