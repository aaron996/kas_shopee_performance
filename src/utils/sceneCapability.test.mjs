import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGL2, pickDefaultSceneMode } from './sceneCapability.js';

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

test('pickDefaultSceneMode: 3D only with WebGL2 and more than 4 cores', () => {
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 8 }), '3d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 5 }), '3d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 4 }), '2d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 2 }), '2d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: undefined }), '2d');
  assert.equal(pickDefaultSceneMode({ webgl2: false, cores: 16 }), '2d');
  assert.equal(pickDefaultSceneMode(), '2d');
});

test('pickDefaultSceneMode: reduced motion still allows 3D', () => {
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 8, reducedMotion: true }), '3d');
});

test('pickDefaultSceneMode: saved choice wins but 3D needs WebGL2', () => {
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 16, saved: '2d' }), '2d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 2, saved: '3d' }), '3d');
  assert.equal(pickDefaultSceneMode({ webgl2: false, cores: 16, saved: '3d' }), '2d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 8, saved: 'bogus' }), '3d');
  assert.equal(pickDefaultSceneMode({ webgl2: true, cores: 2, saved: null }), '2d');
});
