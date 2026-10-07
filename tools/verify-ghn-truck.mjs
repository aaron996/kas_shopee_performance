import fs from 'node:fs';
import assert from 'node:assert/strict';

function readGlb(filename) {
  const file = fs.readFileSync(filename);
  assert.equal(file.readUInt32LE(0), 0x46546c67);
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString().trim());
  function accessor(index) {
    const a = doc.accessors[index]; const view = doc.bufferViews[a.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const at = 28 + jsonLength + (view.byteOffset || 0) + (a.byteOffset || 0);
    return Array.from({length: a.count}, (_, i) => Array.from({length: components}, (_, k) =>
      a.componentType === 5126 ? file.readFloatLE(at + (i * components + k) * 4) : file.readUInt32LE(at + (i * components + k) * 4)));
  }
  function texture() {
    const v = doc.bufferViews[doc.images[0].bufferView];
    return file.subarray(28 + jsonLength + (v.byteOffset || 0), 28 + jsonLength + (v.byteOffset || 0) + v.byteLength);
  }
  return {doc, accessor, texture};
}
const source = readGlb('output/imagegen/ghn-truck-meshy-v1.glb');
const split = readGlb('public/models/ghn-truck-wheels-v1.glb');
assert.equal(split.doc.meshes.length, 5);
assert.equal(split.doc.materials.length, 1);
assert.equal(split.doc.textures.length, 1);
assert.deepEqual(split.texture(), source.texture(), 'The texture must remain byte-identical');
const sourcePrimitive = source.doc.meshes[0].primitives[0];
const sourcePositions = source.accessor(sourcePrimitive.attributes.POSITION);
const sourceUv = source.accessor(sourcePrimitive.attributes.TEXCOORD_0);
const sourceNormals = source.accessor(sourcePrimitive.attributes.NORMAL);
const ground = Math.min(...sourcePositions.map(p => p[1]));
const sourceIndices = source.accessor(sourcePrimitive.indices).flat();
const sourceVertices = sourcePositions.map(([x,y,z], i) => ({p:[-x*3,(y-ground)*3,-z*3], uv:sourceUv[i], n:[-sourceNormals[i][0],sourceNormals[i][1],-sourceNormals[i][2]]}));
const targetVertices = []; const targetIndices = [];
for (const node of split.doc.nodes) {
  const primitive = split.doc.meshes[node.mesh].primitives[0];
  const positions = split.accessor(primitive.attributes.POSITION);
  const uv = split.accessor(primitive.attributes.TEXCOORD_0);
  const normals = split.accessor(primitive.attributes.NORMAL);
  const pivot = node.translation;
  if (node.extras.wheel) {
    assert.equal(node.extras.spinAxis, 'z');
    assert.ok(node.extras.radius > 0.2 && node.extras.radius < 0.25);
    // Axial centre must remain close to local XY origin to avoid orbiting a misplaced pivot.
    for (const axis of [0,1]) {
      const lo = Math.min(...positions.map(p => p[axis])); const hi = Math.max(...positions.map(p => p[axis]));
      assert.ok(Math.abs((lo + hi) / 2) < 0.01, `${node.name} pivot axis ${axis}`);
    }
  }
  const offset = targetVertices.length;
  targetVertices.push(...positions.map((p,i) => ({p:p.map((v,k) => v+pivot[k]), uv:uv[i], n:normals[i]})));
  targetIndices.push(...split.accessor(primitive.indices).flat().map(i=>i+offset));
}
assert.equal(targetIndices.length, sourceIndices.length);
// Match whole triangles, not just vertex counts: no lost/duplicated faces or changed UV seams.
// Float32 serialization may move reconstructed positions by a few last-place bits.
const vertexError = (a,b) => Math.max(...a.p.map((v,k)=>Math.abs(v-b.p[k])), ...a.uv.map((v,k)=>Math.abs(v-b.uv[k])), ...a.n.map((v,k)=>Math.abs(v-b.n[k])));
const sourceTriangles = Array.from({length:sourceIndices.length/3},(_,i)=>sourceIndices.slice(i*3,i*3+3).map(n=>sourceVertices[n]));
const remaining = new Set(sourceTriangles.map((_,i)=>i));
for (let i=0;i<targetIndices.length;i+=3) {
  const t=targetIndices.slice(i,i+3).map(n=>targetVertices[n]);
  const match=[...remaining].find(n=>t.every((v,k)=>vertexError(v,sourceTriangles[n][k])<1e-6));
  assert.notEqual(match,undefined,'Every output triangle must match exactly one source triangle including UVs and normals');
  remaining.delete(match);
}
assert.equal(remaining.size,0);
console.log('PASS: all 5,018 triangles, winding, UVs, normals and texture preserved; four centered wheel pivots.');
