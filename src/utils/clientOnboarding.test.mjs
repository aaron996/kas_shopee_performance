import test from 'node:test';
import assert from 'node:assert/strict';
import { needsClientChoice, saveClientChoice } from './clientOnboarding.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};
const today = new Date('2026-10-07T16:59:00Z');

test('first visit prompts, same user/day/build does not prompt across sessions', () => {
  const saved = storage();
  assert.equal(needsClientChoice(saved, 'user@ghn.vn', 'build-1', today), true);
  saveClientChoice(saved, 'user@ghn.vn', 'build-1', today);
  assert.equal(needsClientChoice(saved, ' USER@GHN.VN ', 'build-1', today), false);
  assert.equal(needsClientChoice(saved, 'other@ghn.vn', 'build-1', today), true);
});

test('Vietnam midnight or a new deployment renews client choice independently', () => {
  const saved = storage();
  saveClientChoice(saved, 'user@ghn.vn', 'build-1', today);
  assert.equal(needsClientChoice(saved, 'user@ghn.vn', 'build-2', today), true);
  assert.equal(needsClientChoice(saved, 'user@ghn.vn', 'build-1', new Date('2026-10-07T17:00:00Z')), true);
});

test('unavailable storage does not crash onboarding', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(needsClientChoice(blocked, 'user@ghn.vn', 'build-1', today), true);
  assert.equal(typeof saveClientChoice(blocked, 'user@ghn.vn', 'build-1', today), 'string');
});
