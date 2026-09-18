import { ChatError } from './errors.js';

export const MAX_EVIDENCE_BYTES = 24 * 1024;

export function serializeEvidence(result, usedBytes = 0) {
  const serialized = JSON.stringify(result);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (usedBytes + bytes > MAX_EVIDENCE_BYTES) {
    throw new ChatError(
      'CHAT_EVIDENCE_TOO_LARGE',
      'Phạm vi dữ liệu quá lớn; hãy thu hẹp khoảng thời gian, đối tượng client, vùng hoặc hub để tiếp tục.',
      422
    );
  }
  return { serialized, bytes };
}

export function toPublicSource(toolName, result) {
  const data = result?.data;
  const baseScope = data?.scope ?? result?.scope ?? null;
  const scope = baseScope ? { ...baseScope } : null;
  if (scope && result?.params) {
    if (result.params.p_regions?.length && !scope.regions) {
      scope.regions = result.params.p_regions.filter(r => r !== '__NO_MATCH__');
    }
    if (result.params.p_hub_types?.length && !scope.hubTypes) {
      scope.hubTypes = result.params.p_hub_types.filter(h => h !== '__NO_MATCH__');
    }
  }
  return {
    evidenceId: result?.evidenceId ?? null,
    tool: toolName,
    dataAsOf: data?.dataAsOf ?? data?.data_as_of ?? null,
    syncedAt: data?.syncedAt ?? data?.synced_at ?? null,
    scope
  };
}
