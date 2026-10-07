import test from 'node:test';
import assert from 'node:assert/strict';
import { accessDay, summarizeAccess } from './devAccessActivity.js';

test('access days and seven-day counts use Vietnam midnight, not UTC', () => {
  assert.equal(accessDay('2026-10-06T17:00:00Z'), '2026-10-07');
  const result = summarizeAccess([
    { email: 'one@example.com', accessed_at: '2026-10-06T16:59:59Z' },
    { email: 'one@example.com', accessed_at: '2026-10-06T17:00:00Z' },
    { email: 'two@example.com', accessed_at: '2026-09-30T17:00:00Z' },
    { email: 'old@example.com', accessed_at: '2026-09-30T16:59:59Z' },
    { email: 'invalid@example.com', accessed_at: 'invalid' }
  ], new Date('2026-10-07T03:00:00Z'));
  assert.deepEqual(result.days.map(day => day.day), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
  assert.deepEqual(result.days.map(day => day.count), [1, 0, 0, 0, 0, 1, 1]);
  assert.equal(result.users.length, 3);
  assert.equal(result.users[0].email, 'one@example.com');
  assert.equal(result.users[0].visits, 2);
  assert.equal(result.users[0].firstSeen, Date.parse('2026-10-06T16:59:59Z'));
});
