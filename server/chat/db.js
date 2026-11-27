import { normalizeChatClient, REVERSE_CLIENT } from '../../src/utils/chatClients.js';
import { callReverseRpc } from './reverse-data.js';
import { callFdRpc } from './fd-data.js';
import { callDetailRpc, needsDetail } from './detail-data.js';
import { createHash } from 'node:crypto';
import { ChatError } from './errors.js';

const MAX_DB_RESULT_BYTES = 24 * 1024;

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export async function callDashboardRpc(userClient, rpcName, params) {
  const startedAt = Date.now();
  const isFd = params.p_metric === 'fd' || params.p_dataset === 'fd';
  if (params.p_metric === 'pud' && normalizeChatClient(params.p_client) !== REVERSE_CLIENT) {
    throw new ChatError('CHAT_DATASET_UNSUPPORTED', 'PUD chỉ có cho client SPE Reverse.', 422);
  }
  // KAS-317: lọc/nhóm theo Tỉnh thành hoặc Lane đọc từ bảng chi tiết (mọi nguồn), không qua RPC hub-level.
  const { data, error } = needsDetail(params)
    ? await callDetailRpc(userClient, rpcName, params)
    : normalizeChatClient(params.p_client) === REVERSE_CLIENT
    ? await callReverseRpc(userClient, rpcName, params)
    : isFd ? await callFdRpc(userClient, rpcName, params)
    : await userClient.rpc(rpcName, params);
  if (error) {
    if (error.code === '57014') {
      throw new ChatError('CHAT_DATA_TIMEOUT', 'Truy vấn dữ liệu mất quá lâu. Vui lòng thử lại hoặc thu hẹp khoảng ngày.', 503, { cause: error });
    }
    console.error('[chat] dashboard rpc failed', {
      rpcName,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Không thể đọc dữ liệu dashboard lúc này.', 503, {
      cause: error
    });
  }

  const serialized = JSON.stringify(data ?? null);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DB_RESULT_BYTES) {
    throw new ChatError('CHAT_DATA_TOO_LARGE', 'Kết quả dữ liệu quá lớn; hãy thu hẹp phạm vi câu hỏi.', 422);
  }

  return {
    evidenceId: `db_${stableHash({ rpcName, params, data })}`,
    queriedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    params,
    data
  };
}

export const DASHBOARD_RPCS = Object.freeze({
  coverage: 'get_ai_chat_coverage',
  metric: 'get_ai_chat_metric',
  ca1: 'get_ai_chat_ca1',
  leadtime: 'get_ai_chat_leadtime'
});
