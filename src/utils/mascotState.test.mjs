import test from 'node:test';
import assert from 'node:assert/strict';
import { getMascotState } from './mascotState.js';

test('mascot follows request lifecycle and exits thinking on stop/close', () => {
  const open = { isOpen: true };
  assert.equal(getMascotState(open), 'idle');
  assert.equal(getMascotState({ ...open, focused: true }), 'listening');
  assert.equal(getMascotState({ ...open, focused: true, pending: { answer: '' } }), 'thinking');
  assert.equal(getMascotState({ ...open, pending: { answer: 'Kết quả' } }), 'speaking');
  assert.equal(getMascotState({ ...open, pending: { answer: 'Kết quả' }, error: 'quota' }), 'error');
  assert.equal(getMascotState({ ...open, pending: null, focused: false, error: null }), 'idle');
  assert.equal(getMascotState({ isOpen: false, error: 'quota', pending: { answer: '' } }), 'idle');
});
