import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { samplePoliceAnimation } from './scenePoliceAnimation.js';

test('shipped officer reaches the target and replays correctly after LoopOnce finishes', async () => {
  const bytes = await readFile(new URL('../../public/models/csgt-check-sequence-v1.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  // Keep all geometry, skin and animation data. Omit only image decoding for
  // this Node test; materials are visually verified in the IAB scene.
  delete data.images; delete data.textures; delete data.materials;
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(data));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + bin.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([header, padded, bin]);
  const model = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  assert.equal(model.animations.length, 1);
  const clip = model.animations[0];
  assert.ok(clip.duration >= 17 && clip.duration < 17.04);
  const mixer = new THREE.AnimationMixer(model.scene);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true; action.play();
  const pose = time => {
    samplePoliceAnimation(mixer, action, time);
    model.scene.updateMatrixWorld(true);
    const values = [];
    model.scene.traverse(n => { if (n.isBone) values.push(...n.matrixWorld.elements); });
    return values;
  };
  const start = pose(0), inspection = pose(7.5);
  const rootTrack = clip.tracks.find(t => t.name.endsWith('.position') && t.values.some(v => v > 4.8));
  assert.ok(rootTrack, 'export must contain the extended approach to the stopped GHN vehicle');
  pose(clip.duration);
  assert.equal(action.paused, true);
  assert.deepEqual(pose(0), start, 'mount pose must recover after the completed check');
  assert.deepEqual(pose(7.5), inspection, 'the second check must reach the same inspection pose');
  assert.notDeepEqual(start, inspection);
});
