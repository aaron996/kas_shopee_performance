import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { isMcpKey } from './auth.js';
import { sendJson } from '../chat/sse.js';

// Read-only MCP endpoint for other agents to query the same dashboard metrics
// the AI chatbot reads (server/chat/tools.js), over the Streamable HTTP
// transport. No per-agent session: a fresh Server + transport is created for
// every request (sessionIdGenerator: undefined => stateless mode).
//
// Lives outside api/ and is mounted at /api/mcp through a vercel.json rewrite
// into an existing function (see api/snapshot-token.js): the project is
// already at the Hobby plan's 12 Serverless Functions cap, same reason
// /api/weather shares api/chat-suggestions.js's slot instead of having its
// own file.
export function createMcpHandler(dependencies = {}) {
  const readKey = dependencies.readKey ?? (() => process.env.MCP_API_KEY?.trim());
  const createServiceClient = dependencies.createServiceClient ?? (() => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !supabaseServiceRoleKey) return null;
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  });

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: { code: 'MCP_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ POST.' } });
      return;
    }

    const key = readKey();
    if (!key) {
      sendJson(res, 503, { error: { code: 'MCP_CONFIG_MISSING', message: 'Chưa cấu hình MCP_API_KEY.' } });
      return;
    }
    if (!isMcpKey(key, req.headers.authorization)) {
      sendJson(res, 401, { error: { code: 'MCP_UNAUTHORIZED', message: 'Sai hoặc thiếu MCP API key.' } });
      return;
    }

    const serviceClient = createServiceClient();
    if (!serviceClient) {
      sendJson(res, 503, { error: { code: 'MCP_CONFIG_MISSING', message: 'Chưa cấu hình Supabase cho MCP.' } });
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
