import { issueSnapshotToken, isSnapshotSecret } from '../server/snapshot/token.js';
import { sendJson } from '../server/chat/sse.js';
import { createMcpHandler } from '../server/mcp/handler.js';
import { createOAuthHandlers } from '../server/mcp/oauth.js';

export const maxDuration = 60;

// n8n (daily Telegram report) calls this with `Authorization: Bearer
// <SNAPSHOT_SECRET>` and gets back a short-lived token for the /snapshot
// page URLs it hands to the screenshot service.
export function createSnapshotTokenHandler(dependencies = {}) {
  const readSecret = dependencies.readSecret ?? (() => process.env.SNAPSHOT_SECRET?.trim());
  const now = dependencies.now ?? Date.now;

  return (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: { code: 'SNAPSHOT_METHOD', message: 'Chỉ hỗ trợ POST.' } });
      return;
    }
    const secret = readSecret();
    if (!secret) {
      sendJson(res, 503, { error: { code: 'SNAPSHOT_CONFIG_MISSING', message: 'Chưa cấu hình SNAPSHOT_SECRET.' } });
      return;
    }
    if (!isSnapshotSecret(secret, req.headers.authorization)) {
      sendJson(res, 401, { error: { code: 'SNAPSHOT_UNAUTHORIZED', message: 'Sai mã bí mật snapshot.' } });
      return;
    }
    sendJson(res, 200, issueSnapshotToken(secret, now()));
  };
}

// Keep /api/mcp and its OAuth endpoints independent at their public URLs
// while sharing this unauthenticated (secret-gated) utility function's
// deployment slot: the project is already at the Hobby plan's 12 Serverless
// Functions cap. See docs/mcp-server.md.
const MCP_ROUTES = [
  { pathname: '/api/mcp', flag: 'mcp', handlerKey: 'mcp' },
  { pathname: '/.well-known/oauth-protected-resource', flag: 'well-known-protected-resource', handlerKey: 'protectedResourceMetadata' },
  { pathname: '/.well-known/oauth-authorization-server', flag: 'well-known-auth-server', handlerKey: 'authorizationServerMetadata' },
  { pathname: '/api/oauth/register', flag: 'oauth-register', handlerKey: 'register' },
  { pathname: '/api/oauth/authorize', flag: 'oauth-authorize', handlerKey: 'authorize' },
  { pathname: '/api/oauth/callback', flag: 'oauth-callback', handlerKey: 'callback' },
  { pathname: '/api/oauth/token', flag: 'oauth-token', handlerKey: 'token' }
];

export function createSnapshotTokenOrMcpHandler({ snapshotToken = createSnapshotTokenHandler(), mcp = createMcpHandler(), oauth = createOAuthHandlers() } = {}) {
  const handlers = { mcp, ...oauth };
  return (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const route = MCP_ROUTES.find(r => url.pathname === r.pathname || url.searchParams.get('__route') === r.flag);
    if (route) return handlers[route.handlerKey](req, res);
    return snapshotToken(req, res);
  };
}
export default createSnapshotTokenOrMcpHandler();
