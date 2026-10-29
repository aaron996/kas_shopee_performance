import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Stateless, HMAC-signed tokens for the MCP OAuth flow (authorize ctx,
// authorization code, access token, refresh token). No DB table: each token
// carries its own payload + expiry + a `purpose` tag, so a token minted for
// one step (e.g. the in-flight authorize context) can never be replayed as
// another (e.g. an access token) even if the secret leaked payload shapes.

function toB64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signToken(secret, purpose, data, ttlSeconds, now = Date.now()) {
  const payload = { ...data, purpose, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = toB64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(secret, token, purpose, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
  const actual = Buffer.from(sig);
  const expected = Buffer.from(expectedSig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.purpose !== purpose) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  const { purpose: _purpose, exp: _exp, ...data } = payload;
  return data;
}

export function randomUrlSafeToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallengeFromVerifier(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function verifyPkce(verifier, challenge) {
  if (typeof verifier !== 'string' || typeof challenge !== 'string' || !verifier || !challenge) return false;
  const actual = Buffer.from(pkceChallengeFromVerifier(verifier));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
