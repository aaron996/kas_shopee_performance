import test from 'node:test';
import assert from 'node:assert/strict';
import { readIdleMode, nextIdleMode, isSceneIdleActive, idleModeControl } from './sceneIdleMode.js';

test('new preferences win; old on/off settings migrate and first visits default to automatic', () => {
  assert.equal(readIdleMode(null, null), 'auto');
  assert.equal(readIdleMode(null, 'false'), 'off');
  assert.equal(readIdleMode(null, 'true'), 'auto');
  assert.equal(readIdleMode('locked', 'false'), 'locked');
  assert.equal(readIdleMode('off', 'true'), 'off');
  assert.equal(readIdleMode('invalid', null), 'auto');
});

test('one button cycles auto to locked to off and back to auto', () => {
  assert.equal(nextIdleMode('auto'), 'locked');
  assert.equal(nextIdleMode('locked'), 'off');
  assert.equal(nextIdleMode('off'), 'auto');
});

test('locked starts immediately and ignores pointer presence; automatic still requires absence', () => {
  for (const absent of [false, true]) {
    assert.equal(isSceneIdleActive('locked', absent, false), true);
    assert.equal(isSceneIdleActive('off', absent, false), false);
    for (const mode of ['locked', 'auto', 'off']) assert.equal(isSceneIdleActive(mode, absent, true), false);
  }
  assert.equal(isSceneIdleActive('auto', false, false), false);
  assert.equal(isSceneIdleActive('auto', true, false), true);
});

test('accessible control copy identifies current mode and the next click', () => {
  assert.match(idleModeControl('locked').label, /Khóa.*tắt/);
  assert.match(idleModeControl('auto').label, /Tự động.*khóa/);
  assert.match(idleModeControl('off').label, /Tắt.*tự động/);
});
