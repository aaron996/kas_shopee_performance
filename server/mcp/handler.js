import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { checkEmailAllowed } from '../../src/utils/authPolicy.js';
import { createMcpServer } from './server.js';
import { readOAuthConfig } from './oauth.js';
import { verifyToken } from './oauth-tokens.js';
import { sendJson } from '../chat/sse.js';

// Read-only MCP endpoint for other agents to query the same dashboard metrics
// the AI chatbot reads (server/chat/tools.js), over the Streamable HTTP
// transport. No per-agent session: a fresh Server + transport is created for
// every request (sessionIdGenerator: undefined => stateless mode).
//
// Auth is OAuth 2.1 (server/mcp/oauth.js): the caller presents an access
// token minted after signing in with Google through this app's existing
// Supabase auth, restricted by checkEmailAllowed. Re-checked here on every
// call (not just at token-mint time) so removing someone from the allowlist
// takes effect before their access token's 1h expiry.
//
// Lives outside api/ and is mounted at /api/mcp through a vercel.json rewrite
// into an existing function (see api/snapshot-token.js): the project is
// already at the Hobby plan's 12 Serverless Functions cap, same reason
// /api/weather shares api/chat-suggestions.js's slot instead of having its
// own file.
export function createMcpHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? (() => readOAuthConfig());
  const checkAllowed = dependencies.checkEmailAllowed ?? checkEmailAllowed;
  const now = dependencies.now ?? (() => Date.now());
  const createServiceClient = dependencies.createServiceClient ?? (config => createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }));

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: { code: 'MCP_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ POST.' } });
      return;
    }

    const config = getConfig();
    if (!config) {
      sendJson(res, 503, { error: { code: 'MCP_CONFIG_MISSING', message: 'Chưa cấu hình MCP OAuth.' } });
      return;
    }

    const unauthorized = () => {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource"`);
      sendJson(res, 401, { error: { code: 'MCP_UNAUTHORIZED', message: 'Thiếu hoặc hết hạn OAuth access token.' } });
    };

    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const tokenData = match && verifyToken(config.secret, match[1].trim(), 'mcp_access', now());
    if (!tokenData) {
      unauthorized();
      return;
    }

    const serviceClient = createServiceClient(config);
    if (!(await checkAllowed(tokenData.email, serviceClient))) {
      unauthorized();
      return;
    }

    try {
      const server = createMcpServer({ serviceClient });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, { error: { code: 'MCP_INTERNAL_ERROR', message: 'Lỗi MCP server.' } });
      }
    }
  };
}
