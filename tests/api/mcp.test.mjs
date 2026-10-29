import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server/mcp/server.js';
import { createMcpHandler } from '../../server/mcp/handler.js';
import { createOAuthHandlers } from '../../server/mcp/oauth.js';
import { pkceChallengeFromVerifier, signToken, verifyToken } from '../../server/mcp/oauth-tokens.js';
import { createSnapshotTokenOrMcpHandler } from '../../api/snapshot-token.js';

function fakeServiceClient() {
  return {
    rpc: async name => {
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-10-01', syncedAt: '2026-10-02T00:00:00Z' }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    }
  };
}

async function connectedClient(serviceClient) {
  const server = createMcpServer({ serviceClient });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

test('lists only the read-only dashboard tools, never the chat-only interaction tools', async () => {
  const { client } = await connectedClient(fakeServiceClient());
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name);
  assert.ok(names.includes('get_data_coverage'));
  assert.ok(names.includes('get_metric_definition'));
  assert.ok(!names.includes('request_metric_query'));
  assert.ok(!names.includes('search_public_information'));
});

test('callTool dispatches through the same validated chat-tool executor', async () => {
  const { client } = await connectedClient(fakeServiceClient());
  const result = await client.callTool({
    name: 'get_data_coverage',
    arguments: { dataset: 'pick', client: 'SPE' }
  });
  assert.equal(result.isError, undefined);
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.data.dataAsOf, '2026-10-01');
});

test('callTool surfaces validation errors instead of throwing', async () => {
  const { client } = await connectedClient(fakeServiceClient());
  const result = await client.callTool({ name: 'get_data_coverage', arguments: { dataset: 'not-a-dataset', client: 'SPE' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /CHAT_TOOL_ARGUMENTS_INVALID/);
});

test('callTool refuses a tool name outside the exposed allowlist', async () => {
  const { client } = await connectedClient(fakeServiceClient());
  const result = await client.callTool({ name: 'request_metric_query', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /không được phép/);
});

function response() {
  return {
    headers: {}, statusCode: 0, headersSent: false, writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); this.headersSent = true; },
    end(text) { if (text) this.body = JSON.parse(text); this.writableEnded = true; this.headersSent = true; }
  };
}

function fakeConfig() {
  return {
    secret: 'test-oauth-secret',
    baseUrl: 'https://app.example.com',
    supabaseUrl: 'https://proj.supabase.co',
    supabaseAnonKey: 'anon-key',
    supabaseServiceRoleKey: 'service-role-key'
  };
}

test('oauth metadata and dynamic client registration', () => {
  const config = fakeConfig();
  const oauth = createOAuthHandlers({ readConfig: () => config });

  const prm = response();
  oauth.protectedResourceMetadata({}, prm);
  assert.equal(prm.body.resource, 'https://app.example.com/api/mcp');
  assert.deepEqual(prm.body.authorization_servers, ['https://app.example.com']);

  const asm = response();
  oauth.authorizationServerMetadata({}, asm);
  assert.equal(asm.body.authorization_endpoint, 'https://app.example.com/api/oauth/authorize');
  assert.deepEqual(asm.body.code_challenge_methods_supported, ['S256']);

  const registered = response();
  oauth.register({ body: { redirect_uris: ['https://claude.ai/api/mcp/callback'], client_name: 'Claude' } }, registered);
  assert.equal(registered.statusCode, 201);
  assert.ok(registered.body.client_id);
  assert.equal(registered.body.token_endpoint_auth_method, 'none');

  const rejected = response();
  oauth.register({ body: { redirect_uris: ['http://evil.example.com'] } }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.body.error, 'invalid_redirect_uri');
});

test('full OAuth round trip: authorize -> Supabase/Google callback -> token -> resource server gate', async () => {
  const config = fakeConfig();
  const now = 1_700_000_000_000;
  const clientVerifier = 'client-side-pkce-verifier';
  const clientChallenge = pkceChallengeFromVerifier(clientVerifier);
  let capturedEmail = null;
  const checkEmailAllowed = async email => { capturedEmail = email; return email === 'vinhlt@ghn.vn'; };

  const oauth = createOAuthHandlers({
    readConfig: () => config,
    now: () => now,
    checkEmailAllowed,
    createServiceClient: () => ({}),
    fetch: async (url, init) => {
      assert.match(url, /^https:\/\/proj\.supabase\.co\/auth\/v1\/token\?grant_type=pkce$/);
      const body = JSON.parse(init.body);
      assert.equal(body.auth_code, 'supabase-code-abc');
      assert.ok(body.code_verifier);
      return { ok: true, json: async () => ({ user: { email: 'vinhlt@ghn.vn' } }) };
    }
  });

  const authorizeReq = {
    url: `/api/oauth/authorize?response_type=code&client_id=claude-cli&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/callback')}&code_challenge=${clientChallenge}&code_challenge_method=S256&state=xyz`
  };
  const authorizeRes = response();
  oauth.authorize(authorizeReq, authorizeRes);
  assert.equal(authorizeRes.statusCode, 302);
  const supabaseAuthorizeUrl = new URL(authorizeRes.headers.Location);
  assert.equal(supabaseAuthorizeUrl.origin, 'https://proj.supabase.co');
  assert.equal(supabaseAuthorizeUrl.searchParams.get('provider'), 'google');
  const callbackUrl = new URL(supabaseAuthorizeUrl.searchParams.get('redirect_to'));
  const ctx = callbackUrl.searchParams.get('ctx');
  assert.ok(ctx);

  const callbackReq = { url: `/api/oauth/callback?ctx=${encodeURIComponent(ctx)}&code=supabase-code-abc` };
  const callbackRes = response();
  await oauth.callback(callbackReq, callbackRes);
  assert.equal(callbackRes.statusCode, 302);
  assert.equal(capturedEmail, 'vinhlt@ghn.vn');
  const finalRedirect = new URL(callbackRes.headers.Location);
  assert.equal(finalRedirect.origin + finalRedirect.pathname, 'https://claude.ai/api/mcp/callback');
  assert.equal(finalRedirect.searchParams.get('state'), 'xyz');
  const mcpCode = finalRedirect.searchParams.get('code');
  assert.ok(mcpCode);

  const wrongVerifierRes = response();
  await oauth.token({ body: { grant_type: 'authorization_code', code: mcpCode, redirect_uri: 'https://claude.ai/api/mcp/callback', client_id: 'claude-cli', code_verifier: 'not-the-right-verifier' } }, wrongVerifierRes);
  assert.equal(wrongVerifierRes.statusCode, 400);
  assert.equal(wrongVerifierRes.body.error, 'invalid_grant');

  const tokenRes = response();
  await oauth.token({ body: { grant_type: 'authorization_code', code: mcpCode, redirect_uri: 'https://claude.ai/api/mcp/callback', client_id: 'claude-cli', code_verifier: clientVerifier } }, tokenRes);
  assert.equal(tokenRes.statusCode, 200);
  assert.ok(tokenRes.body.access_token);
  assert.ok(tokenRes.body.refresh_token);

  const mcpHandler = createMcpHandler({ readConfig: () => config, now: () => now, checkEmailAllowed, createServiceClient: () => fakeServiceClient() });
  const mcpRes = response();
  try {
    await mcpHandler({ method: 'POST', headers: { authorization: `Bearer ${tokenRes.body.access_token}` }, body: {} }, mcpRes);
  } catch { /* the fake res lacks real transport plumbing; what matters here is that auth already passed */ }
  assert.notEqual(mcpRes.statusCode, 401);
  assert.notEqual(mcpRes.statusCode, 503);

  const refreshRes = response();
  await oauth.token({ body: { grant_type: 'refresh_token', refresh_token: tokenRes.body.refresh_token } }, refreshRes);
  assert.equal(refreshRes.statusCode, 200);
  assert.ok(refreshRes.body.access_token);
});

test('callback denies a disallowed email instead of minting an MCP code', async () => {
  const config = fakeConfig();
  const now = 1_700_000_000_000;
  const oauth = createOAuthHandlers({
    readConfig: () => config,
    now: () => now,
    checkEmailAllowed: async () => false,
    createServiceClient: () => ({}),
    fetch: async () => ({ ok: true, json: async () => ({ user: { email: 'stranger@gmail.com' } }) })
  });
  const ctx = signToken(config.secret, 'mcp_authorize', {
    mcpClientId: 'claude-cli', mcpRedirectUri: 'https://claude.ai/api/mcp/callback',
    mcpCodeChallenge: 'x', mcpState: null, mcpResource: null, supabaseVerifier: 'v'
  }, 600, now);
  const res = response();
  await oauth.callback({ url: `/api/oauth/callback?ctx=${encodeURIComponent(ctx)}&code=abc` }, res);
  assert.equal(res.statusCode, 302);
  const redirect = new URL(res.headers.Location);
  assert.equal(redirect.searchParams.get('error'), 'access_denied');
});

test('resource server rejects missing/invalid/expired tokens with a WWW-Authenticate challenge', async () => {
  const config = fakeConfig();
  const now = 1_700_000_000_000;
  const handler = createMcpHandler({ readConfig: () => config, now: () => now, checkEmailAllowed: async () => true, createServiceClient: () => fakeServiceClient() });

  const resGet = response();
  await handler({ method: 'GET', headers: {} }, resGet);
  assert.equal(resGet.statusCode, 405);

  const resMissing = response();
  await handler({ method: 'POST', headers: {} }, resMissing);
  assert.equal(resMissing.statusCode, 401);
  assert.match(resMissing.headers['WWW-Authenticate'], /resource_metadata="https:\/\/app\.example\.com\/\.well-known\/oauth-protected-resource"/);

  const expired = signToken(config.secret, 'mcp_access', { email: 'vinhlt@ghn.vn' }, 3600, now - 2 * 3600 * 1000);
  const resExpired = response();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${expired}` } }, resExpired);
  assert.equal(resExpired.statusCode, 401);

  const noConfigHandler = createMcpHandler({ readConfig: () => null });
  const resNoConfig = response();
  await noConfigHandler({ method: 'POST', headers: { authorization: 'Bearer anything' } }, resNoConfig);
  assert.equal(resNoConfig.statusCode, 503);
});

test('resource server re-checks checkEmailAllowed on every call, not just at token-mint time', async () => {
  const config = fakeConfig();
  const now = 1_700_000_000_000;
  const token = signToken(config.secret, 'mcp_access', { email: 'removed@ghn.vn' }, 3600, now);
  const handler = createMcpHandler({ readConfig: () => config, now: () => now, checkEmailAllowed: async () => false, createServiceClient: () => fakeServiceClient() });
  const res = response();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` } }, res);
  assert.equal(res.statusCode, 401);
});

test('/api/mcp and its OAuth endpoints share the snapshot-token deployment slot and route by path or query marker', async () => {
  const calls = { mcp: 0, snapshotToken: 0, authorize: 0 };
  const dispatch = createSnapshotTokenOrMcpHandler({
    snapshotToken: (req, res) => { calls.snapshotToken++; res.end?.(); },
    mcp: (req, res) => { calls.mcp++; res.end?.(); },
    oauth: { protectedResourceMetadata() {}, authorizationServerMetadata() {}, register() {}, authorize: (req, res) => { calls.authorize++; res.end?.(); }, callback() {}, token() {} }
  });
  const noop = { end: () => {} };

  await dispatch({ method: 'POST', url: '/api/mcp', headers: {} }, noop);
  assert.equal(calls.mcp, 1);

  await dispatch({ method: 'POST', url: '/api/snapshot-token?__route=mcp', headers: {} }, noop);
  assert.equal(calls.mcp, 2);

  await dispatch({ method: 'GET', url: '/api/oauth/authorize?foo=bar', headers: {} }, noop);
  assert.equal(calls.authorize, 1);

  await dispatch({ method: 'POST', url: '/api/snapshot-token', headers: {} }, noop);
  assert.equal(calls.snapshotToken, 1);
});

test('verifyToken rejects tampered payloads, wrong purpose and token confusion across purposes', () => {
  const secret = 'shh';
  const now = 1_700_000_000_000;
  const accessToken = signToken(secret, 'mcp_access', { email: 'a@ghn.vn' }, 3600, now);
  assert.equal(verifyToken(secret, accessToken, 'mcp_refresh', now), null);
  assert.ok(verifyToken(secret, accessToken, 'mcp_access', now));
  const [body] = accessToken.split('.');
  assert.equal(verifyToken(secret, `${body}.tampered-signature`, 'mcp_access', now), null);
  assert.equal(verifyToken('different-secret', accessToken, 'mcp_access', now), null);
});
