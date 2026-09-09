import crypto from 'node:crypto';
import { ChatError } from './errors.js';

export function normalizeQuestionText(text) {
  if (typeof text !== 'string') return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function computeQuestionFingerprint(text) {
  const normalized = normalizeQuestionText(text)
    .replace(/[.,?!:;'"()\[\]{}]/g, '')
    .trim();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

function mapQuotaError(error) {
  const message = error?.message ?? '';
  if (message.includes('AI_CHAT_DUPLICATE')) {
    return new ChatError('CHAT_REQUEST_DUPLICATE', 'Câu hỏi này đang được xử lý hoặc đã hoàn tất.', 409);
  }
  if (message.includes('AI_CHAT_PAYLOAD_CONFLICT')) {
    return new ChatError('CHAT_REQUEST_CONFLICT', 'requestId đã được dùng cho nội dung khác.', 409);
  }
  if (message.includes('AI_CHAT_TURN_LIMIT') || message.includes('AI_CHAT_BUDGET_LIMIT')) {
    return new ChatError(
      'CHAT_QUOTA_EXCEEDED',
      'Bạn đã dùng hết 10 lượt hôm nay. Hạn mức được làm mới vào lúc 00:00 ngày mai (giờ Việt Nam).',
      429
    );
  }
  return new ChatError('CHAT_QUOTA_UNAVAILABLE', 'Chưa thể kiểm tra hạn mức chatbot.', 503, { cause: error });
}

export async function reserveChatRequest(serviceClient, config, request, userId, payloadHash, options = {}) {
  const question = typeof request?.question === 'string' ? request.question : '';
  const normalizedQuestion = normalizeQuestionText(question);
  const fingerprint = computeQuestionFingerprint(question);
  const userEmail = options.email || options.userEmail || request?.userEmail || null;

  const { data, error } = await serviceClient.rpc('reserve_ai_chat_request', {
    p_user_id: userId,
    p_org_id: config.orgId,
    p_request_id: request.requestId,
    p_payload_hash: payloadHash,
    p_reserved_microusd: config.requestReserveMicrousd,
    p_user_turn_limit: config.userDailyTurns,
    p_org_turn_limit: config.orgDailyTurns,
    p_user_budget_microusd: config.userDailyMicrousd,
    p_org_budget_microusd: config.orgDailyMicrousd,
    p_user_email: userEmail,
    p_question: question,
    p_question_normalized: normalizedQuestion,
    p_question_fingerprint: fingerprint,
    p_client_filter: options.clientFilter || request?.clientFilter || null,
    p_active_tab: options.activeTab || request?.activeTab || null,
    p_model: config.model
  });

  if (error) throw mapQuotaError(error);
  return data;
}

export async function finalizeChatRequest(serviceClient, requestId, details = {}) {
  const shouldRefund = Boolean(
    details.refundTurn ||
    details.status === 'aborted' ||
    (details.status === 'failed' && (!details.actualMicrousd || details.actualMicrousd === 0))
  );

  const { error } = await serviceClient.rpc('finalize_ai_chat_request', {
    p_request_id: requestId,
    p_status: details.status || 'completed',
    p_actual_microusd: details.actualMicrousd ?? 0,
    p_usage: details.usage ?? [],
    p_tool_names: [...new Set(details.toolNames ?? [])],
    p_refund_turn: shouldRefund,
    p_error_code: details.errorCode || null,
    p_error_message: details.errorMessage || null
  });

  if (error) {
    throw new ChatError('CHAT_USAGE_FINALIZE_FAILED', 'Không thể hoàn tất ghi nhận lượt chatbot.', 503, { cause: error });
  }
}

export async function recordQuotaRejection(serviceClient, config, request, userId, payloadHash, email = null) {
  if (typeof serviceClient?.rpc !== 'function') return;
  const question = typeof request?.question === 'string' ? request.question : '';
  const normalizedQuestion = normalizeQuestionText(question);
  const fingerprint = computeQuestionFingerprint(question);

  try {
    await serviceClient.rpc('record_ai_chat_quota_rejection', {
      p_user_id: userId,
      p_org_id: config.orgId,
      p_request_id: request.requestId,
      p_payload_hash: payloadHash,
      p_user_email: email,
      p_question: question,
      p_question_normalized: normalizedQuestion,
      p_question_fingerprint: fingerprint,
      p_client_filter: request?.clientFilter || null,
      p_active_tab: request?.activeTab || null,
      p_model: config.model
    });
  } catch (err) {
    // Non-blocking telemetry failure
    console.error('Failed to log quota rejection:', err);
  }
}

export async function getUserQuotaInfo(client, userId = null) {
  const { data, error } = await client.rpc('get_user_ai_chat_quota', {
    p_user_id: userId
  });
  if (error) {
    throw new ChatError('CHAT_QUOTA_INFO_FAILED', 'Không thể kiểm tra thông tin quota.', 500, { cause: error });
  }
  return data;
}
