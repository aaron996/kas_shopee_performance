import { ChatError } from './errors.js';

export const MAX_EVIDENCE_BYTES = 24 * 1024;

export function serializeEvidence(result, usedBytes = 0) {
  const serialized = JSON.stringify(result);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (usedBytes + bytes > MAX_EVIDENCE_BYTES) {
    throw new ChatError('CHAT_EVIDENCE_TOO_LARGE', 'Phạm vi dữ liệu quá lớn; hãy thu hẹp câu hỏi.', 422);
  }
  return { serialized, bytes };
}

export function toPublicSource(toolName, result) {
  const data = result?.data;
  return {
    evidenceId: result?.evidenceId ?? null,
    tool: toolName,
    dataAsOf: data?.dataAsOf ?? data?.data_as_of ?? null,
    syncedAt: data?.syncedAt ?? data?.synced_at ?? null,
    scope: data?.scope ?? null
  };
}
