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
