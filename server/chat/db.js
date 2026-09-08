import { createHash } from 'node:crypto';
import { ChatError } from './errors.js';

const MAX_DB_RESULT_BYTES = 24 * 1024;

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export async function callDashboardRpc(userClient, rpcName, params) {
  const startedAt = Date.now();
  const { data, error } = await userClient.rpc(rpcName, params);
  if (error) {
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
    data
  };
}

export const DASHBOARD_RPCS = Object.freeze({
  coverage: 'get_ai_chat_coverage',
  metric: 'get_ai_chat_metric',
  ca1: 'get_ai_chat_ca1',
  leadtime: 'get_ai_chat_leadtime'
});
