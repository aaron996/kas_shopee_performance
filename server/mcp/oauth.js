import { createClient } from '@supabase/supabase-js';
import { checkEmailAllowed } from '../../src/utils/authPolicy.js';
import { sendJson } from '../chat/sse.js';
import { pkceChallengeFromVerifier, randomUrlSafeToken, signToken, verifyPkce, verifyToken } from './oauth-tokens.js';

const AUTHORIZE_CTX_TTL_SECONDS = 10 * 60;
const MCP_CODE_TTL_SECONDS = 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

// A minimal OAuth 2.1 authorization server (Dynamic Client Registration +
// PKCE authorization code) sitting in front of this app's existing Supabase
// Google sign-in. There is no separate Google Cloud OAuth app and no new
// database table: Google auth is delegated entirely to Supabase (same
// provider the dashboard login already uses — src/components/AuthModal.jsx),
// and every MCP-side token is a stateless, HMAC-signed value from
// oauth-tokens.js. Registered clients are not persisted: this is a public
// client model (no client_secret), matching how Claude itself behaves as an
// MCP OAuth client, and the real access gate is Google sign-in plus
// checkEmailAllowed, not client secrecy. See docs/mcp-server.md.
export function readOAuthConfig(env = process.env) {
  const secret = env.MCP_OAUTH_SECRET?.trim();
  const baseUrl = env.MCP_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '');
  const supabaseUrl = env.SUPABASE_URL?.trim()?.replace(/\/$/, '');
  const supabaseAnonKey = env.SUPABASE_ANON_KEY?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret || !baseUrl || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return null;
  return { secret, baseUrl, supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

function isAllowedRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function errorRedirect(res, redirectUri, state, error, description) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  res.writeHead(302, { Location: url.toString() });
  res.end();
}

export function createOAuthHandlers(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? (() => readOAuthConfig());
  const fetchImpl = dependencies.fetch ?? fetch;
  const checkAllowed = dependencies.checkEmailAllowed ?? checkEmailAllowed;
  const now = dependencies.now ?? (() => Date.now());
  const randomToken = dependencies.randomUrlSafeToken ?? randomUrlSafeToken;
  const createServiceClient = dependencies.createServiceClient ?? (config => createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }));

  function requireConfig(res) {
    const config = getConfig();
    if (!config) {
      sendJson(res, 503, { error: 'server_error', error_description: 'MCP OAuth chưa được cấu hình đầy đủ.' });
      return null;
    }
    return config;
  }

  return {
    protectedResourceMetadata(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      sendJson(res, 200, {
        resource: `${config.baseUrl}/api/mcp`,
        authorization_servers: [config.baseUrl]
      });
    },

    authorizationServerMetadata(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      sendJson(res, 200, {
        issuer: config.baseUrl,
        authorization_endpoint: `${config.baseUrl}/api/oauth/authorize`,
        token_endpoint: `${config.baseUrl}/api/oauth/token`,
        registration_endpoint: `${config.baseUrl}/api/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      });
    },

    register(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
      if (!redirectUris.length || !redirectUris.every(isAllowedRedirectUri)) {
        sendJson(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris phải là https (hoặc loopback) và không rỗng.' });
        return;
      }
      sendJson(res, 201, {
        client_id: randomToken(16),
        client_id_issued_at: Math.floor(now() / 1000),
        redirect_uris: redirectUris,
        client_name: typeof body?.client_name === 'string' ? body.client_name.slice(0, 200) : undefined,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      });
    },

    authorize(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      const url = new URL(req.url || '/', 'http://localhost');
      const q = url.searchParams;
      const redirectUri = q.get('redirect_uri');
      const clientId = q.get('client_id');
      const codeChallenge = q.get('code_challenge');
      const codeChallengeMethod = q.get('code_challenge_method');
      const responseType = q.get('response_type');
      const state = q.get('state');
      const resource = q.get('resource');

      if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
        sendJson(res, 400, { error: 'invalid_request', error_description: 'redirect_uri thiếu hoặc không hợp lệ.' });
        return;
      }
      if (responseType !== 'code' || !clientId || !codeChallenge || codeChallengeMethod !== 'S256') {
        errorRedirect(res, redirectUri, state, 'invalid_request', 'Thiếu client_id/code_challenge hoặc response_type/code_challenge_method không được hỗ trợ.');
        return;
      }

      const supabaseVerifier = randomToken(32);
      const ctx = signToken(config.secret, 'mcp_authorize', {
        mcpClientId: clientId,
        mcpRedirectUri: redirectUri,
        mcpCodeChallenge: codeChallenge,
        mcpState: state ?? null,
        mcpResource: resource ?? null,
        supabaseVerifier
      }, AUTHORIZE_CTX_TTL_SECONDS, now());

      const callbackUrl = `${config.baseUrl}/api/oauth/callback?ctx=${encodeURIComponent(ctx)}`;
      const authorizeUrl = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
      authorizeUrl.searchParams.set('provider', 'google');
      authorizeUrl.searchParams.set('redirect_to', callbackUrl);
      authorizeUrl.searchParams.set('code_challenge', pkceChallengeFromVerifier(supabaseVerifier));
      authorizeUrl.searchParams.set('code_challenge_method', 's256');
      res.writeHead(302, { Location: authorizeUrl.toString() });
      res.end();
    },

    async callback(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      const url = new URL(req.url || '/', 'http://localhost');
      const q = url.searchParams;
      const ctxData = verifyToken(config.secret, q.get('ctx'), 'mcp_authorize', now());
      if (!ctxData) {
        sendJson(res, 400, { error: 'invalid_request', error_description: 'Phiên đăng nhập đã hết hạn, vui lòng thử kết nối lại.' });
        return;
      }
      const { mcpRedirectUri, mcpState } = ctxData;

      const authError = q.get('error');
      if (authError) {
        errorRedirect(res, mcpRedirectUri, mcpState, authError, q.get('error_description'));
        return;
      }
      const supabaseCode = q.get('code');
      if (!supabaseCode) {
        errorRedirect(res, mcpRedirectUri, mcpState, 'server_error', 'Thiếu mã xác thực từ Google/Supabase.');
        return;
      }

      let session;
      try {
        const tokenRes = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey },
          body: JSON.stringify({ auth_code: supabaseCode, code_verifier: ctxData.supabaseVerifier })
        });
        if (!tokenRes.ok) throw new Error(`supabase token exchange failed: ${tokenRes.status}`);
        session = await tokenRes.json();
      } catch {
        errorRedirect(res, mcpRedirectUri, mcpState, 'server_error', 'Không đổi được phiên đăng nhập Google/Supabase.');
        return;
      }

      const email = session?.user?.email;
      const serviceClient = createServiceClient(config);
      if (!(await checkAllowed(email, serviceClient))) {
        errorRedirect(res, mcpRedirectUri, mcpState, 'access_denied', 'Tài khoản này không có quyền dùng MCP.');
        return;
      }

      const mcpCode = signToken(config.secret, 'mcp_code', {
        email,
        mcpClientId: ctxData.mcpClientId,
        mcpRedirectUri,
        mcpCodeChallenge: ctxData.mcpCodeChallenge,
        mcpResource: ctxData.mcpResource
      }, MCP_CODE_TTL_SECONDS, now());

      const redirectUrl = new URL(mcpRedirectUri);
      redirectUrl.searchParams.set('code', mcpCode);
      if (mcpState) redirectUrl.searchParams.set('state', mcpState);
      res.writeHead(302, { Location: redirectUrl.toString() });
      res.end();
    },

    async token(req, res) {
      const config = requireConfig(res);
      if (!config) return;
      let body = req.body;
      if (typeof body === 'string') {
        body = Object.fromEntries(new URLSearchParams(body));
      }
      body = body || {};

      if (body.grant_type === 'authorization_code') {
        const data = verifyToken(config.secret, body.code, 'mcp_code', now());
        if (!data
          || data.mcpClientId !== body.client_id
          || data.mcpRedirectUri !== body.redirect_uri
          || !verifyPkce(body.code_verifier, data.mcpCodeChallenge)) {
          sendJson(res, 400, { error: 'invalid_grant' });
          return;
        }
        const access_token = signToken(config.secret, 'mcp_access', { email: data.email, aud: `${config.baseUrl}/api/mcp` }, ACCESS_TOKEN_TTL_SECONDS, now());
        const refresh_token = signToken(config.secret, 'mcp_refresh', { email: data.email }, REFRESH_TOKEN_TTL_SECONDS, now());
        sendJson(res, 200, { access_token, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token });
        return;
      }

      if (body.grant_type === 'refresh_token') {
        const data = verifyToken(config.secret, body.refresh_token, 'mcp_refresh', now());
        const serviceClient = data && createServiceClient(config);
        if (!data || !(await checkAllowed(data.email, serviceClient))) {
          sendJson(res, 400, { error: 'invalid_grant' });
          return;
        }
        const access_token = signToken(config.secret, 'mcp_access', { email: data.email, aud: `${config.baseUrl}/api/mcp` }, ACCESS_TOKEN_TTL_SECONDS, now());
        sendJson(res, 200, { access_token, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS });
        return;
      }

      sendJson(res, 400, { error: 'unsupported_grant_type' });
    }
  };
}
