import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived tokens for the /snapshot page. n8n trades SNAPSHOT_SECRET for a
// token (api/snapshot-token.js) and puts only the token in the page URL — that
// URL is handed to an external screenshot service, so it must never carry the
// long-lived secret itself.
export const SNAPSHOT_TOKEN_TTL_SECONDS = 30 * 60;

function sign(secret, exp) {
  return createHmac('sha256', secret).update(`snapshot:${exp}`).digest('base64url');
}

export function issueSnapshotToken(secret, now = Date.now(), ttlSeconds = SNAPSHOT_TOKEN_TTL_SECONDS) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { token: `${exp}.${sign(secret, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifySnapshotToken(secret, token, now = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const [expText, signature, extra] = token.split('.');
  if (extra !== undefined || !/^\d+$/.test(expText || '') || !signature) return false;
  const exp = Number(expText);
  if (exp * 1000 <= now) return false;

  const expected = Buffer.from(sign(secret, exp));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Constant-time compare for the Bearer secret n8n sends to the token endpoint.
export function isSnapshotSecret(secret, authorization) {
  if (!secret || typeof authorization !== 'string') return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(match[1].trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
