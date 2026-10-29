import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server/mcp/server.js';
import { createMcpHandler } from '../../api/mcp.js';
import { isMcpKey } from '../../server/mcp/auth.js';

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

test('isMcpKey compares constant-time and rejects malformed headers', () => {
  assert.equal(isMcpKey('secret', 'Bearer secret'), true);
  assert.equal(isMcpKey('secret', 'Bearer wrong'), false);
  assert.equal(isMcpKey('secret', 'secret'), false);
  assert.equal(isMcpKey('', 'Bearer secret'), false);
  assert.equal(isMcpKey('secret', undefined), false);
});

function response() {
  return {
    headers: {}, statusCode: 0, headersSent: false, writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    end(text) { this.body = text ? JSON.parse(text) : undefined; this.writableEnded = true; this.headersSent = true; }
  };
}

test('handler rejects non-POST, missing config and wrong key before touching Supabase', async () => {
  const handler = createMcpHandler({ readKey: () => 'shh', createServiceClient: () => { throw new Error('must not be called'); } });

  const resGet = response();
  await handler({ method: 'GET', headers: {} }, resGet);
  assert.equal(resGet.statusCode, 405);

  const resUnauthorized = response();
  await handler({ method: 'POST', headers: {} }, resUnauthorized);
  assert.equal(resUnauthorized.statusCode, 401);

  const noKeyHandler = createMcpHandler({ readKey: () => '', createServiceClient: () => { throw new Error('must not be called'); } });
  const resNoConfig = response();
  await noKeyHandler({ method: 'POST', headers: { authorization: 'Bearer anything' } }, resNoConfig);
  assert.equal(resNoConfig.statusCode, 503);
});
