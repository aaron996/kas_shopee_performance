import { ChatError } from './errors.js';

function mapQuotaError(error) {
  const message = error?.message ?? '';
  if (message.includes('AI_CHAT_DUPLICATE')) {
    return new ChatError('CHAT_REQUEST_DUPLICATE', 'Câu hỏi này đang được xử lý hoặc đã hoàn tất.', 409);
  }
  if (message.includes('AI_CHAT_PAYLOAD_CONFLICT')) {
    return new ChatError('CHAT_REQUEST_CONFLICT', 'requestId đã được dùng cho nội dung khác.', 409);
  }
  if (message.includes('AI_CHAT_TURN_LIMIT') || message.includes('AI_CHAT_BUDGET_LIMIT')) {
    return new ChatError('CHAT_QUOTA_EXCEEDED', 'Hôm nay bạn đã hết lượt hoặc ngân sách chatbot.', 429);
  }
  return new ChatError('CHAT_QUOTA_UNAVAILABLE', 'Chưa thể kiểm tra hạn mức chatbot.', 503, { cause: error });
}

export async function reserveChatRequest(serviceClient, config, request, userId, payloadHash) {
  const { data, error } = await serviceClient.rpc('reserve_ai_chat_request', {
    p_user_id: userId,
    p_org_id: config.orgId,
    p_request_id: request.requestId,
    p_payload_hash: payloadHash,
    p_reserved_microusd: config.requestReserveMicrousd,
    p_user_turn_limit: config.userDailyTurns,
    p_org_turn_limit: config.orgDailyTurns,
    p_user_budget_microusd: config.userDailyMicrousd,
    p_org_budget_microusd: config.orgDailyMicrousd
  });
  if (error) throw mapQuotaError(error);
  return data;
}

export async function finalizeChatRequest(serviceClient, requestId, details) {
  const { error } = await serviceClient.rpc('finalize_ai_chat_request', {
    p_request_id: requestId,
    p_status: details.status,
    p_actual_microusd: details.actualMicrousd,
    p_usage: details.usage,
    p_tool_names: [...new Set(details.toolNames ?? [])]
  });
  if (error) throw new ChatError('CHAT_USAGE_FINALIZE_FAILED', 'Không thể hoàn tất ghi nhận lượt chatbot.', 503, { cause: error });
}
