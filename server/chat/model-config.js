import { ChatError } from './errors.js';
import { resolveModelSelection } from './config.js';

/**
 * Resolves the effective AI Chatbot model configuration according to precedence:
 *   1. User-specific override (ai_chat_model_config where scope_type = 'user' and user_id = user.id)
 *   2. Global 'All' configuration (ai_chat_model_config where scope_type = 'all')
 *   3. Base environment default (baseConfig.model, baseConfig.reasoningEffort)
 *
 * Requirements:
 * - Differentiates database errors (fails closed with 503 ChatError) from zero rows (valid fallback).
 * - Runs resolved configuration through resolveModelSelection.
 * - Stored invalid model/reasoning fails safely with 503 ChatError without calling OpenAI.
 * - No in-process cache to ensure immediate updates across new chat turns.
 *
 * @param {object} serviceClient - Supabase client with service_role privileges
 * @param {object} baseConfig - Base chat configuration (from readChatConfig)
 * @param {object} user - Authenticated user { id, email }
 * @returns {Promise<object>} Effective config merging baseConfig with resolved model and reasoningEffort
 */
export async function resolveEffectiveChatConfig(serviceClient, arg2, arg3 = null) {
  if (!serviceClient || typeof serviceClient.from !== 'function') {
    throw new ChatError('CHAT_CONFIG_UNAVAILABLE', 'Không có kết nối cơ sở dữ liệu để kiểm tra cấu hình chatbot.', 503);
  }

  let baseConfig;
  let user;
  if (arg2 && typeof arg2 === 'object' && arg2.allowedModels) {
    baseConfig = arg2;
    user = arg3;
  } else if (arg3 && typeof arg3 === 'object' && arg3.allowedModels) {
    baseConfig = arg3;
    user = arg2;
  } else {
    baseConfig = arg2 || {};
    user = arg3 || null;
  }

  const userId = typeof user === 'string' ? user : user?.id;
  let query = serviceClient.from('ai_chat_model_config').select('*');
  if (userId) {
    if (typeof query.or === 'function') {
      query = query.or(`and(scope_type.eq.all,scope_key.eq.all),and(scope_type.eq.user,scope_key.eq.${userId})`);
    }
  } else {
    if (typeof query.eq === 'function') {
      query = query.eq('scope_type', 'all');
    }
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new ChatError(
      'CHAT_CONFIG_UNAVAILABLE',
      'Không thể truy vấn cấu hình AI model từ cơ sở dữ liệu.',
      503,
      { cause: error }
    );
  }

  const configRows = Array.isArray(rows) ? rows : [];
  const userConfig = userId
    ? configRows.find(r => r.scope_type === 'user' && (r.scope_key === userId || r.user_id === userId))
    : null;
  const allConfig = configRows.find(r => r.scope_type === 'all');

  let selectedModel;
  let selectedReasoningEffort;
  let source;

  if (userConfig) {
    selectedModel = userConfig.model;
    selectedReasoningEffort = userConfig.reasoning_effort;
    source = 'user';
  } else if (allConfig) {
    selectedModel = allConfig.model;
    selectedReasoningEffort = allConfig.reasoning_effort;
    source = 'all';
  } else {
    selectedModel = baseConfig.model;
    selectedReasoningEffort = baseConfig.reasoningEffort;
    source = 'env';
  }

  let modelSelection;
  try {
    modelSelection = resolveModelSelection(selectedModel, selectedReasoningEffort);
  } catch (err) {
    throw new ChatError(
      'CHAT_CONFIG_UNAVAILABLE',
      `Cấu hình model/reasoning lưu trữ không hợp lệ: ${err.message}`,
      503,
      { cause: err }
    );
  }

  return {
    ...baseConfig,
    model: modelSelection.model,
    reasoningEffort: modelSelection.reasoningEffort,
    source,
    globalConfig: allConfig ? {
      scopeType: allConfig.scope_type,
      model: allConfig.model,
      reasoningEffort: allConfig.reasoning_effort,
      updatedBy: allConfig.updated_by,
      reason: allConfig.reason,
      updatedAt: allConfig.updated_at
    } : null,
    targetConfig: userConfig ? {
      scopeType: userConfig.scope_type,
      userId: userConfig.user_id,
      userEmail: userConfig.user_email,
      model: userConfig.model,
      reasoningEffort: userConfig.reasoning_effort,
      updatedBy: userConfig.updated_by,
      reason: userConfig.reason,
      updatedAt: userConfig.updated_at
    } : null
  };
}

/**
 * Helper for admin dashboard to inspect allowed models, current global/user settings,
 * effective resolution, and recent audit logs.
 */
export async function getModelConfigOverview(serviceClient, baseConfig, targetUserId = null) {
  if (!serviceClient || typeof serviceClient.from !== 'function') {
    throw new ChatError('CHAT_CONFIG_UNAVAILABLE', 'Không thể kết nối cơ sở dữ liệu.', 503);
  }

  const [configsResult, auditsResult] = await Promise.all([
    serviceClient
      .from('ai_chat_model_config')
      .select('*')
      .order('updated_at', { ascending: false }),
    serviceClient
      .from('ai_chat_model_config_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  if (configsResult.error) {
    throw new ChatError('CHAT_CONFIG_UNAVAILABLE', 'Lỗi truy vấn cấu hình AI model.', 503, { cause: configsResult.error });
  }

  if (auditsResult.error) {
    throw new ChatError('CHAT_CONFIG_UNAVAILABLE', 'Lỗi truy vấn lịch sử kiểm toán cấu hình AI.', 503, { cause: auditsResult.error });
  }

  const rows = configsResult.data || [];
  const globalRow = rows.find(r => r.scope_type === 'all');
  const targetRow = targetUserId ? rows.find(r => r.scope_type === 'user' && (r.scope_key === targetUserId || r.user_id === targetUserId)) : null;

  let effectiveModel;
  let effectiveReasoningEffort;
  let effectiveSource;

  if (targetRow) {
    effectiveModel = targetRow.model;
    effectiveReasoningEffort = targetRow.reasoning_effort;
    effectiveSource = 'user';
  } else if (globalRow) {
    effectiveModel = globalRow.model;
    effectiveReasoningEffort = globalRow.reasoning_effort;
    effectiveSource = 'all';
  } else {
    effectiveModel = baseConfig.model;
    effectiveReasoningEffort = baseConfig.reasoningEffort;
    effectiveSource = 'env';
  }

  const modelSelection = resolveModelSelection(effectiveModel, effectiveReasoningEffort);

  return {
    allowedModels: baseConfig.allowedModels,
    envDefault: {
      model: baseConfig.model,
      reasoningEffort: baseConfig.reasoningEffort
    },
    globalConfig: globalRow ? {
      scopeType: 'all',
      model: globalRow.model,
      reasoningEffort: globalRow.reasoning_effort,
      updatedBy: globalRow.updated_by,
      reason: globalRow.reason,
      updatedAt: globalRow.updated_at
    } : null,
    targetConfig: targetRow ? {
      scopeType: 'user',
      userId: targetRow.user_id,
      userEmail: targetRow.user_email,
      model: targetRow.model,
      reasoningEffort: targetRow.reasoning_effort,
      updatedBy: targetRow.updated_by,
      reason: targetRow.reason,
      updatedAt: targetRow.updated_at
    } : null,
    userOverrides: rows
      .filter(r => r.scope_type === 'user')
      .map(r => ({
        userId: r.user_id,
        userEmail: r.user_email,
        model: r.model,
        reasoningEffort: r.reasoning_effort,
        updatedBy: r.updated_by,
        reason: r.reason,
        updatedAt: r.updated_at
      })),
    effectiveConfig: {
      model: modelSelection.model,
      reasoningEffort: modelSelection.reasoningEffort
    },
    effectiveSource,
    recentAudits: (auditsResult.data || []).map(a => ({
      id: a.id,
      scopeType: a.scope_type,
      scopeKey: a.scope_key,
      userId: a.user_id,
      userEmail: a.user_email,
      previousModel: a.previous_model,
      previousReasoningEffort: a.previous_reasoning_effort,
      newModel: a.new_model,
      newReasoningEffort: a.new_reasoning_effort,
      action: a.action,
      changedBy: a.changed_by,
      reason: a.reason,
      createdAt: a.created_at
    }))
  };
}
