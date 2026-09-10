import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { calculateModelCost, formatMicrousdToUsd, MODEL_PRICING } from './pricing.js';
import { readChatConfig } from './config.js';
import { computeQuestionFingerprint, finalizeChatRequest, normalizeQuestionText, reserveChatRequest } from './quota.js';
import { createChatHandler } from '../../api/chat.js';
import { createAiOpsHandler, maskEmail } from '../../api/ai-ops.js';
import { ChatError } from './errors.js';

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.body = '';
    this.statusCode = 200;
    this.headersSent = false;
    this.writableEnded = false;
  }
  setHeader(name, value) { this.headers[name] = value; }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.headersSent = true; this.body += chunk; return true; }
  end(chunk = '') { this.body += chunk; this.headersSent = true; this.writableEnded = true; }
}

test('MODEL_PRICING calculates exact integer micro-USD for Luna without float inaccuracies', () => {
  assert.ok(MODEL_PRICING['gpt-5.6-luna']);

  // 80 non-cached input tokens, 20 cached input tokens, 50 output tokens
  // 80 * 200 + 20 * 20 + 50 * 1200 = 16000 + 400 + 60000 = 76400 nano-USD
  // 76400 / 1000 = 76.4 -> Math.ceil = 77 micro-USD
  const cost = calculateModelCost('gpt-5.6-luna', {
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 50
  });

  assert.equal(cost.configured, true);
  assert.equal(cost.microusd, 77);
  assert.equal(formatMicrousdToUsd(77), '$0.000077');
  assert.equal(formatMicrousdToUsd(1500000), '$1.50');
  assert.equal(formatMicrousdToUsd(0), '$0.00');
});

test('MODEL_PRICING calculates Terra cost using the published token rates', () => {
  assert.ok(MODEL_PRICING['gpt-5.6-terra']);
  const cost = calculateModelCost('gpt-5.6-terra', {
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 50
  });
  assert.equal(cost.configured, true);
  assert.equal(cost.microusd, 764); // 80*2 + 20*0.2 + 50*12
});

test('calculateModelCost fails gracefully when model pricing is missing', () => {
  const cost = calculateModelCost('unknown-model-xyz', { inputTokens: 500, outputTokens: 200 });
  assert.equal(cost.configured, false);
  assert.equal(cost.microusd, 0);
  assert.match(cost.error, /Chưa cấu hình giá/);
});

test('config defaults userDailyTurns to 10 as specified by operations policy', () => {
  const env = {
    AI_CHAT_ENABLED: 'true',
    OPENAI_API_KEY: 'test-key',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key'
  };
  const config = readChatConfig(env);
  assert.equal(config.userDailyTurns, 10);
});

test('computeQuestionFingerprint creates stable, normalized hash across punctuation and whitespace', () => {
  const q1 = 'ODR SPB hôm nay là bao nhiêu?';
  const q2 = '  odr   spb  hôm nay là bao nhiêu !  ';
  assert.equal(normalizeQuestionText(q1), 'odr spb hôm nay là bao nhiêu?');
  assert.equal(computeQuestionFingerprint(q1), computeQuestionFingerprint(q2));
  assert.notEqual(computeQuestionFingerprint(q1), computeQuestionFingerprint('OPR SPB là bao nhiêu?'));
});

test('reserveChatRequest forwards email, fingerprint, metadata and quota limits', async () => {
  const rpcCalls = [];
  const serviceClient = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      return {
        data: {
          requestId: params.p_request_id,
          quotaDate: '2026-09-09',
          dailyLimit: 10,
          usedToday: 1,
          remainingTurns: 9,
          resetAt: '2026-09-10T00:00:00+07:00'
        },
        error: null
      };
    }
  };

  const config = {
    orgId: 'ghn-kas',
    model: 'gpt-5.6-luna',
    requestReserveMicrousd: 25000,
    userDailyTurns: 10,
    orgDailyTurns: 600,
    userDailyMicrousd: 500000,
    orgDailyMicrousd: 5000000
  };

  const res = await reserveChatRequest(
    serviceClient,
    config,
    { requestId: '550e8400-e29b-41d4-a716-446655440000', question: 'Tình hình Ca 1?' },
    'u-123',
    'hash-abc',
    { email: 'user@ghn.vn', clientFilter: 'SPB', activeTab: 'report5' }
  );

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'reserve_ai_chat_request');
  assert.equal(rpcCalls[0].params.p_user_email, 'user@ghn.vn');
  assert.equal(rpcCalls[0].params.p_question, 'Tình hình Ca 1?');
  assert.equal(rpcCalls[0].params.p_user_turn_limit, 10);
  assert.equal(res.remainingTurns, 9);
});

test('finalizeChatRequest triggers refund_turn on aborted or failed without output', async () => {
  const rpcCalls = [];
  const serviceClient = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      return { data: true, error: null };
    }
  };

  // Case 1: aborted
  await finalizeChatRequest(serviceClient, 'req-1', { status: 'aborted', actualMicrousd: 0 });
  assert.equal(rpcCalls[0].params.p_refund_turn, true);
  assert.equal(rpcCalls[0].params.p_status, 'aborted');

  // Case 2: completed with answer
  await finalizeChatRequest(serviceClient, 'req-2', { status: 'completed', actualMicrousd: 100 });
  assert.equal(rpcCalls[1].params.p_refund_turn, false);
  assert.equal(rpcCalls[1].params.p_status, 'completed');

  // Case 3: failed with 0 microusd
  await finalizeChatRequest(serviceClient, 'req-3', { status: 'failed', actualMicrousd: 0 });
  assert.equal(rpcCalls[2].params.p_refund_turn, true);
  assert.equal(rpcCalls[2].params.p_status, 'failed');
});

test('api/chat GET returns quota status for current authenticated user', async () => {
  const handler = createChatHandler({
    readConfig: () => ({ model: 'gpt-5.6-luna' }),
    authenticate: async () => ({
      user: { id: 'u-123', email: 'nhanvien@ghn.vn' },
      serviceClient: {}
    }),
    getUserQuotaInfo: async () => ({
      dailyLimit: 10,
      usedToday: 3,
      remainingTurns: 7,
      resetAt: '2026-09-10T00:00:00+07:00',
      isUnlimited: false
    })
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/api/chat';
  req.headers = { authorization: 'Bearer valid-jwt' };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.quota.remainingTurns, 7);
  assert.equal(json.quota.dailyLimit, 10);
});

test('api/chat returns structured 429 on quota exceeded with reset time', async () => {
  let rejectionLogged = false;
  const handler = createChatHandler({
    readConfig: () => ({ model: 'gpt-5.6-luna', turnTimeoutMs: 5000 }),
    authenticate: async () => ({
      user: { id: 'u-123', email: 'nhanvien@ghn.vn' },
      serviceClient: {},
      userClient: {}
    }),
    reserve: async () => {
      throw new ChatError(
        'CHAT_QUOTA_EXCEEDED',
        'Bạn đã dùng hết 10 lượt hôm nay. Hạn mức được làm mới vào lúc 00:00 ngày mai (giờ Việt Nam).',
        429
      );
    },
    recordQuotaRejection: async () => { rejectionLogged = true; }
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = { authorization: 'Bearer valid-jwt', 'content-length': '80' };
  req.body = { requestId: '550e8400-e29b-41d4-a716-446655440000', question: 'test', history: [] };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  const json = JSON.parse(res.body);
  assert.equal(json.error.code, 'CHAT_QUOTA_EXCEEDED');
  assert.match(json.error.message, /10 lượt/);
  assert.equal(rejectionLogged, true);
});

test('maskEmail obfuscates email addresses for privacy', () => {
  assert.equal(maskEmail('vinhlt@ghn.vn'), 'v****t@ghn.vn');
  assert.equal(maskEmail('admin@ghn.vn'), 'a***n@ghn.vn');
  assert.equal(maskEmail('ab@ghn.vn'), 'a*@ghn.vn');
  assert.equal(maskEmail(null), 'Ẩn danh');
});

test('api/ai-ops rejects regular users with 403 fail-closed', async () => {
  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-regular', email: 'regular_user@ghn.vn' },
      serviceClient: {}
    })
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/api/ai-ops?view=overview';
  req.headers = { authorization: 'Bearer regular-jwt' };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 403);
  const json = JSON.parse(res.body);
  assert.equal(json.error.code, 'AI_OPS_FORBIDDEN');
});

test('api/ai-ops allows dev admin (vinhlt@ghn.vn) to fetch overview metrics', async () => {
  const mockRequests = [
    {
      request_id: 'r1',
      user_id: 'u1',
      quota_date: '2026-09-09',
      status: 'completed',
      actual_microusd: 77,
      total_tokens: 150,
      input_tokens: 100,
      output_tokens: 50,
      model: 'gpt-5.6-luna',
      started_at: '2026-09-09T10:00:00Z'
    },
    {
      request_id: 'r2',
      user_id: 'u2',
      quota_date: '2026-09-09',
      status: 'failed',
      actual_microusd: 0,
      total_tokens: 0,
      model: 'gpt-5.6-luna',
      started_at: '2026-09-09T11:00:00Z'
    }
  ];

  const serviceClient = {
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: async () => ({ data: mockRequests, error: null })
        }),
        then: resolve => resolve({ data: mockRequests, error: null })
      })
    })
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({ userDailyTurns: 10 }),
    authenticate: async () => ({
      user: { id: 'u-dev-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/api/ai-ops?view=overview&from=2026-09-01&to=2026-09-09';
  req.headers = { authorization: 'Bearer admin-jwt' };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.totalRequests, 2);
  assert.equal(json.activeUsersCount, 2);
  assert.equal(json.byStatus.completed, 1);
  assert.equal(json.byStatus.failed, 1);
  assert.equal(json.totalCostMicrousd, 77);
  assert.equal(json.totalCostFormatted, '$0.000077');
});

test('api/ai-ops records the authenticated Dev Admin in a quota override audit entry', async () => {
  const rpcCalls = [];
  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-dev-admin', email: 'vinhlt@ghn.vn' },
      serviceClient: {
        rpc: async (name, params) => {
          rpcCalls.push({ name, params });
          return { data: { success: true }, error: null };
        }
      }
    })
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/ai-ops';
  req.headers = { authorization: 'Bearer admin-jwt' };
  const res = new FakeResponse();
  const response = handler(req, res);
  process.nextTick(() => {
    req.emit('data', JSON.stringify({
      action: 'set-override',
      userId: '15333a48-af77-4093-822f-0cb40bc5e106',
      userEmail: 'vinhlt@ghn.vn',
      dailyTurnLimit: 20,
      isUnlimited: false,
      reason: 'Kiểm thử audit'
    }));
    req.emit('end');
  });
  await response;

  assert.equal(res.statusCode, 200);
  assert.equal(rpcCalls[0].name, 'admin_set_user_quota_override');
  assert.equal(rpcCalls[0].params.p_changed_by, 'vinhlt@ghn.vn');
});

test('api/ai-ops export-csv outputs UTF-8 CSV with masked user and without secrets', async () => {
  const mockRequests = [
    {
      started_at: '2026-09-09T10:00:00Z',
      user_email: 'user1@ghn.vn',
      question: 'ODR SPB hôm nay?',
      status: 'completed',
      model: 'gpt-5.6-luna',
      latency_ms: 1200,
      input_tokens: 80,
      output_tokens: 40,
      total_tokens: 120,
      actual_microusd: 60,
      tool_names: ['get_metric_summary']
    }
  ];

  const serviceClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: mockRequests, error: null })
        })
      })
    })
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/api/ai-ops?view=export-csv';
  req.headers = { authorization: 'Bearer admin-jwt' };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /text\/csv/);
  assert.match(res.body, /u\*{3}1@ghn\.vn/); // Masked email!
  assert.ok(!res.body.includes('user1@ghn.vn')); // Raw email must not appear
  assert.ok(!res.body.includes('Bearer')); // No secrets
  assert.match(res.body, /ODR SPB hôm nay\?/);
});

test('api/ai-ops set-override handles email string as userId safely and passes null p_user_id to RPC', async () => {
  let rpcCall = null;
  const serviceClient = {
    rpc: async (name, params) => {
      rpcCall = { name, params };
      return { data: { success: true, userId: '0a417740-4032-4d43-9557-35727f2b5293' }, error: null };
    }
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/ai-ops';
  req.headers = { authorization: 'Bearer admin-jwt' };
  req.body = {
    action: 'set-override',
    userId: 'bachpt@ghn.vn',
    userEmail: 'bachpt@ghn.vn',
    isUnlimited: true,
    reason: 'Phê duyệt hạn mức đặc biệt'
  };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(rpcCall.name, 'admin_set_user_quota_override');
  assert.equal(rpcCall.params.p_user_id, null); // Must be null, NOT 'bachpt@ghn.vn'
  assert.equal(rpcCall.params.p_user_email, 'bachpt@ghn.vn');
  assert.equal(rpcCall.params.p_is_unlimited, true);
  assert.equal(rpcCall.params.p_daily_turn_limit, null);
  assert.equal(rpcCall.params.p_changed_by, 'vinhlt@ghn.vn');
});

test('api/ai-ops set-override preserves valid UUID when provided', async () => {
  let rpcCall = null;
  const serviceClient = {
    rpc: async (name, params) => {
      rpcCall = { name, params };
      return { data: { success: true }, error: null };
    }
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const uuid = '0a417740-4032-4d43-9557-35727f2b5293';
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/ai-ops';
  req.headers = { authorization: 'Bearer admin-jwt' };
  req.body = {
    action: 'set-override',
    userId: uuid,
    userEmail: 'bachpt@ghn.vn',
    dailyTurnLimit: 25,
    isUnlimited: false,
    reason: 'Tăng quota 25 lượt'
  };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(rpcCall.params.p_user_id, uuid);
  assert.equal(rpcCall.params.p_user_email, 'bachpt@ghn.vn');
  assert.equal(rpcCall.params.p_daily_turn_limit, 25);
  assert.equal(rpcCall.params.p_is_unlimited, false);
});

test('api/ai-ops set-override returns friendly error when user not found', async () => {
  const serviceClient = {
    rpc: async () => ({
      data: null,
      error: { message: 'AI_CHAT_USER_NOT_FOUND: Không tìm thấy tài khoản người dùng với email unknown@ghn.vn' }
    })
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/ai-ops';
  req.headers = { authorization: 'Bearer admin-jwt' };
  req.body = {
    action: 'set-override',
    userId: null,
    userEmail: 'unknown@ghn.vn',
    isUnlimited: true,
    reason: 'Test unknown user'
  };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  const json = JSON.parse(res.body);
  assert.match(json.error.message, /Không tìm thấy tài khoản người dùng với email unknown@ghn\.vn/);
});

test('api/ai-ops reset-override supports email resolution and null userId', async () => {
  let rpcCall = null;
  const serviceClient = {
    rpc: async (name, params) => {
      rpcCall = { name, params };
      return { data: { success: true, defaultLimit: 10 }, error: null };
    }
  };

  const handler = createAiOpsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({
      user: { id: 'u-admin', email: 'vinhlt@ghn.vn' },
      serviceClient
    })
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/ai-ops';
  req.headers = { authorization: 'Bearer admin-jwt' };
  req.body = {
    action: 'reset-override',
    userId: 'bachpt@ghn.vn', // email mistakenly sent as userId
    userEmail: 'bachpt@ghn.vn',
    reason: 'Quay về mặc định'
  };

  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(rpcCall.name, 'admin_reset_user_quota');
  assert.equal(rpcCall.params.p_user_id, null);
  assert.equal(rpcCall.params.p_user_email, 'bachpt@ghn.vn');
  assert.equal(rpcCall.params.p_changed_by, 'vinhlt@ghn.vn');
});

