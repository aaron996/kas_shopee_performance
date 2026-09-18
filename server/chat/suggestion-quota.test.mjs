import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeSuggestionQuota,
  getIctDateString,
  resetSuggestionQuotaMemoryForTesting
} from './suggestion-quota.js';

test('getIctDateString formats correctly in Asia/Ho_Chi_Minh timezone', () => {
  // 2026-09-18T17:00:00Z is 2026-09-19 00:00 in ICT (+7)
  const dt1 = new Date('2026-09-18T16:59:59Z');
  assert.equal(getIctDateString(dt1), '2026-09-18');

  const dt2 = new Date('2026-09-18T17:00:01Z');
  assert.equal(getIctDateString(dt2), '2026-09-19');
});

test('consumeSuggestionQuota: allows up to 10 refreshes per user per ICT day', async () => {
  resetSuggestionQuotaMemoryForTesting();
  const userId = 'user-123';
  const now = new Date('2026-09-18T03:00:00Z'); // 10:00 AM ICT

  for (let i = 1; i <= 10; i += 1) {
    const res = await consumeSuggestionQuota(null, userId, 10, now);
    assert.equal(res.allowed, true);
    assert.equal(res.count, i);
    assert.equal(res.remaining, 10 - i);
  }

  // 11th attempt is rejected
  const res11 = await consumeSuggestionQuota(null, userId, 10, now);
  assert.equal(res11.allowed, false);
  assert.equal(res11.count, 10);
  assert.equal(res11.remaining, 0);
});

test('consumeSuggestionQuota: resets counter on next ICT day (00:00 ICT boundary)', async () => {
  resetSuggestionQuotaMemoryForTesting();
  const userId = 'user-123';
  const day1 = new Date('2026-09-18T12:00:00Z'); // 19:00 ICT on Sep 18
  const day2 = new Date('2026-09-18T17:05:00Z'); // 00:05 ICT on Sep 19 (new ICT day!)

  // Exhaust quota on Day 1
  for (let i = 1; i <= 10; i += 1) {
    await consumeSuggestionQuota(null, userId, 10, day1);
  }
  const rejectedDay1 = await consumeSuggestionQuota(null, userId, 10, day1);
  assert.equal(rejectedDay1.allowed, false);

  // Day 2 (after 00:00 ICT): quota is reset!
  const firstDay2 = await consumeSuggestionQuota(null, userId, 10, day2);
  assert.equal(firstDay2.allowed, true);
  assert.equal(firstDay2.count, 1);
  assert.equal(firstDay2.remaining, 9);
});

test('consumeSuggestionQuota: different users have independent quotas', async () => {
  resetSuggestionQuotaMemoryForTesting();
  const now = new Date('2026-09-18T05:00:00Z');

  for (let i = 1; i <= 10; i += 1) {
    await consumeSuggestionQuota(null, 'user-A', 10, now);
  }
  const resA = await consumeSuggestionQuota(null, 'user-A', 10, now);
  assert.equal(resA.allowed, false);

  const resB = await consumeSuggestionQuota(null, 'user-B', 10, now);
  assert.equal(resB.allowed, true);
  assert.equal(resB.count, 1);
});

test('consumeSuggestionQuota ignores client-provided limit expansion and strictly caps at 10', async () => {
  resetSuggestionQuotaMemoryForTesting();
  const userId = 'user-limit-bypass';
  const now = new Date('2026-09-18T06:00:00Z');

  // Even if caller attempts to pass limit = 9999
  for (let i = 1; i <= 10; i += 1) {
    const res = await consumeSuggestionQuota(null, userId, 9999, now);
    assert.equal(res.allowed, true);
    assert.equal(res.limit, 10);
  }
  const blocked = await consumeSuggestionQuota(null, userId, 9999, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 10);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.limit, 10);
});

test('consumeSuggestionQuota via serviceClient RPC accurately processes turn 1-10 allowed=true and turn 11+ allowed=false', async () => {
  const rpcCalls = [];
  let simulatedDbCount = 0;
  const mockServiceClient = {
    async rpc(fnName, params) {
      rpcCalls.push({ fnName, params });
      assert.equal(fnName, 'consume_ai_chat_suggestion_quota');
      assert.equal(params.p_limit, 10);
      assert.equal(params.p_user_id, 'user-rpc-test');

      // Simulate the exact SQL logic of 20260918_harden_ai_chat_suggestion_quota.sql
      if (simulatedDbCount <= 10) {
        simulatedDbCount += 1;
      }
      const allowed = simulatedDbCount <= 10;
      return {
        data: {
          allowed,
          count: Math.min(simulatedDbCount, 10),
          limit: 10,
          remaining: Math.max(0, 10 - simulatedDbCount),
          date: '2026-09-18'
        },
        error: null
      };
    }
  };

  for (let turn = 1; turn <= 10; turn += 1) {
    const res = await consumeSuggestionQuota(mockServiceClient, 'user-rpc-test', 10);
    assert.equal(res.allowed, true, `Turn ${turn} must be allowed`);
    assert.equal(res.count, turn);
    assert.equal(res.remaining, 10 - turn);
  }

  // Turn 11: must return allowed = false
  const turn11 = await consumeSuggestionQuota(mockServiceClient, 'user-rpc-test', 10);
  assert.equal(turn11.allowed, false, 'Turn 11 must be blocked');
  assert.equal(turn11.count, 10);
  assert.equal(turn11.remaining, 0);

  // Turn 12+: continues to return allowed = false
  const turn12 = await consumeSuggestionQuota(mockServiceClient, 'user-rpc-test', 10);
  assert.equal(turn12.allowed, false, 'Turn 12 must be blocked');
  assert.equal(turn12.count, 10);
  assert.equal(turn12.remaining, 0);
});

test('SQL contract: migration 20260918_harden_ai_chat_suggestion_quota.sql satisfies security and boundary specs', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const migrationPath = path.resolve('supabase/migrations/20260918_harden_ai_chat_suggestion_quota.sql');
  const sql = await fs.readFile(migrationPath, 'utf8');

  // 1. Revokes execute from authenticated, anon, public
  assert.match(sql, /revoke\s+(all|execute)\s+on\s+function\s+public\.consume_ai_chat_suggestion_quota\s*\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i);

  // 2. Grants execute exclusively to service_role
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.consume_ai_chat_suggestion_quota\s*\([^)]*\)\s+to\s+service_role/i);

  // 3. Enforces constant server-side limit of 10
  assert.match(sql, /v_limit\s+constant\s+integer\s*:=\s*10;/i);

  // 4. Returns allowed for turns 1-10 (<= v_limit) and blocks turn 11+
  assert.match(sql, /v_allowed\s*:=\s*\(v_count\s*<=\s*v_limit\);/i);
});
