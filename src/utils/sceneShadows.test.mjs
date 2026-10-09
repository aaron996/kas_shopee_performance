import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTruckShadowGeometry, shouldRefreshSceneShadow } from './sceneShadows.js';

test('cruise and replay refresh shadows on every moving frame at all display rates', () => {
  for (const fps of [20, 30, 60, 120]) {
    const updates = Array.from({ length: fps }, () => shouldRefreshSceneShadow({ enabled: true, moving: true, changed: false }));
    assert.equal(updates.filter(Boolean).length, fps);
  }
});

test('paused maps update only for light, camera, or caster changes; disabled shadows stay off', () => {
  assert.equal(shouldRefreshSceneShadow({ enabled: true, moving: false, changed: false }), false);
  assert.equal(shouldRefreshSceneShadow({ enabled: true, moving: false, changed: true }), true);
  assert.equal(shouldRefreshSceneShadow({ enabled: false, moving: true, changed: true }), false);
});

test('shadow proxy is a closed, bounded truck silhouette with a small triangle budget', () => {
  const geometry = createTruckShadowGeometry();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x >= 2.9 && size.x <= 3.1);
  assert.ok(size.y >= 1.4 && size.y <= 1.6);
  assert.ok(size.z >= 1.1 && size.z <= 1.5);
  assert.ok(geometry.boundingBox.min.y >= 0 && geometry.boundingBox.max.y <= 1.6);
  assert.ok(geometry.index.count / 3 <= 48);
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  // Every triangle remains non-degenerate after combining the three boxes.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < geometry.index.count; i += 3) {
    a.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i));
    b.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i + 1));
    c.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 0);
  }
  geometry.dispose();
});
