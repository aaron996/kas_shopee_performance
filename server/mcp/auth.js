import { timingSafeEqual } from 'node:crypto';

// Constant-time compare for the Bearer key other agents send to the MCP endpoint.
// Mirrors server/snapshot/token.js's isSnapshotSecret.
export function isMcpKey(key, authorization) {
  if (!key || typeof authorization !== 'string') return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const expected = Buffer.from(key);
  const actual = Buffer.from(match[1].trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
