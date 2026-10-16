import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGL2 } from './sceneCapability.js';

test('detectWebGL2: true when webgl2 context is available', () => {
  const seen = [];
  const ok = detectWebGL2(() => ({ getContext: (type) => { seen.push(type); return {}; } }));
  assert.equal(ok, true);
  assert.deepEqual(seen, ['webgl2']);
});

test('detectWebGL2: false when context is null, factory throws, or canvas is unusable', () => {
  assert.equal(detectWebGL2(() => ({ getContext: () => null })), false);
  assert.equal(detectWebGL2(() => { throw new Error('no dom'); }), false);
  assert.equal(detectWebGL2(() => ({ getContext: () => { throw new Error('blocked'); } })), false);
  assert.equal(detectWebGL2(() => null), false);
  assert.equal(detectWebGL2(() => ({})), false);
});
