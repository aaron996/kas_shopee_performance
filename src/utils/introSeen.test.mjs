import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSeenIntroToday, markIntroSeen } from './introSeen.js';

const memory = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const today = new Date('2026-10-12T03:00:00Z');

test('intro seen is per user and per Vietnam business day', () => {
  const s = memory();
  assert.equal(hasSeenIntroToday(s, 'a@ghn.vn', today), false);
  markIntroSeen(s, ' A@ghn.vn ', today);
  assert.equal(hasSeenIntroToday(s, 'a@ghn.vn', today), true);
  assert.equal(hasSeenIntroToday(s, 'b@ghn.vn', today), false);
  assert.equal(hasSeenIntroToday(s, 'a@ghn.vn', new Date('2026-10-12T20:00:00Z')), false);
});

test('blocked storage never grants or throws', () => {
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.doesNotThrow(() => markIntroSeen(blocked, 'a@ghn.vn', today));
  assert.equal(hasSeenIntroToday(blocked, 'a@ghn.vn', today), false);
});
