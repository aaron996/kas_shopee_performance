import fs from 'node:fs';
import path from 'node:path';

// Split intact connected components, preserving every source triangle and UV.
// Coordinates are calibrated to the selected Meshy truck, not a general mesh cutter.
const input = 'output/imagegen/ghn-truck-meshy-v1.glb';
const output = 'public/models/ghn-truck-wheels-v1.glb';
const file = fs.readFileSync(input);
const jsonLength = file.readUInt32LE(12);
const source = JSON.parse(file.subarray(20, 20 + jsonLength).toString().trim());
const binaryOffset = 28 + jsonLength;
const sourcePrimitive = source.meshes[0].primitives[0];
function readAccessor(index) {
  const a = source.accessors[index];
  const v = source.bufferViews[a.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const at = binaryOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  if (![5125, 5126].includes(a.componentType) || v.byteStride) throw Error('Unexpected source layout');
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, k) =>
    a.componentType === 5126 ? file.readFloatLE(at + (i * components + k) * 4) : file.readUInt32LE(at + (i * components + k) * 4)));
}
const positions = readAccessor(sourcePrimitive.attributes.POSITION);
const normals = readAccessor(sourcePrimitive.attributes.NORMAL);
const uvs = readAccessor(sourcePrimitive.attributes.TEXCOORD_0);
const indices = readAccessor(sourcePrimitive.indices).flat();
const parents = positions.map((_, i) => i);
const find = (i) => parents[i] === i ? i : (parents[i] = find(parents[i]));
const welded = new Map();
positions.forEach((p, i) => {
  const key = p.map(n => Math.round(n * 1e5)).join(',');
  if (welded.has(key)) parents[i] = welded.get(key);
  else welded.set(key, i);
});
const triangles = [];
for (let i = 0; i < indices.length; i += 3) {
  const t = indices.slice(i, i + 3);
  triangles.push(t);
  parents[find(t[1])] = find(t[0]);
  parents[find(t[2])] = find(t[0]);
}
const components = new Map();
for (const t of triangles) {
  const root = find(t[0]);
  if (!components.has(root)) components.set(root, []);
  components.get(root).push(t);
}
const scale = 3;
const ground = source.accessors[sourcePrimitive.attributes.POSITION].min[1];
// Rotate 180 degrees about Y: generated cab faces -X, scene driving faces +X.
const transform = ([x, y, z]) => [-x * scale, (y - ground) * scale, -z * scale];
const wheels = [
  { name: 'wheel-front-left', center: [-0.31525, -0.18566, -0.1666], side: -1, radius: 0.0755 },
  { name: 'wheel-front-right', center: [-0.31525, -0.18566, 0.1627], side: 1, radius: 0.0755 },
  { name: 'wheel-rear-left', center: [0.2765, -0.1911, -0.142], side: -1, radius: 0.0755 },
  { name: 'wheel-rear-right', center: [0.2765, -0.1911, 0.136], side: 1, radius: 0.0755 }
];
const parts = [{ name: 'body', center: null, triangles: [] }, ...wheels.map(w => ({ ...w, triangles: [] }))];
for (const ts of components.values()) {
  const vertices = [...new Set(ts.flat())].map(i => positions[i]);
  const wheel = parts.slice(1).find(w => vertices.every(p =>
    p[2] * w.side > 0.085 && Math.hypot(p[0] - w.center[0], p[1] - w.center[1]) < 0.0795));
  (wheel || parts[0]).triangles.push(...ts);
}
for (const w of parts.slice(1)) if (w.triangles.length < 300) throw Error(`Incomplete wheel: ${w.name}`);
if (parts.reduce((n, p) => n + p.triangles.length, 0) !== triangles.length) throw Error('Triangle conservation failed');
const chunks = [];
const gltf = { asset: { version: '2.0', generator: 'GHN component-preserving wheel preparation' },
  scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [],
  buffers: [{ byteLength: 0 }], materials: source.materials, textures: source.textures,
  samplers: source.samplers, images: [] };
let byteLength = 0;
function append(data, target) {
  const view = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, ...(target ? { target } : {}) });
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  data.copy(padded); chunks.push(padded); byteLength += padded.length;
  return view;
}
function accessor(values, type, integer = false) {
  const flat = values.flat(); const data = Buffer.alloc(flat.length * 4);
  flat.forEach((v, i) => integer ? data.writeUInt32LE(v, i * 4) : data.writeFloatLE(v, i * 4));
  const n = gltf.accessors.length;
  gltf.accessors.push({ bufferView: append(data, integer ? 34963 : 34962), componentType: integer ? 5125 : 5126,
    count: values.length, type, ...(!integer ? {
      min: values[0].map((_, k) => Math.min(...values.map(v => v[k]))),
      max: values[0].map((_, k) => Math.max(...values.map(v => v[k]))) } : {}) });
  return n;
}
for (const part of parts) {
  const ids = [...new Set(part.triangles.flat())]; const mapping = new Map(ids.map((v, i) => [v, i]));
  const pivot = part.center ? transform(part.center) : [0, 0, 0];
  const localPositions = ids.map(i => transform(positions[i]).map((v, k) => v - pivot[k]));
  const attributes = { POSITION: accessor(localPositions, 'VEC3'),
    NORMAL: accessor(ids.map(i => [-normals[i][0], normals[i][1], -normals[i][2]]), 'VEC3'),
    TEXCOORD_0: accessor(ids.map(i => uvs[i]), 'VEC2') };
  const mesh = gltf.meshes.length;
  gltf.meshes.push({ name: part.name, primitives: [{ attributes, indices: accessor(part.triangles.flat().map(i => mapping.get(i)), 'SCALAR', true), material: 0, mode: 4 }] });
  gltf.scenes[0].nodes.push(gltf.nodes.length);
  gltf.nodes.push({ name: part.name, mesh, translation: pivot,
    extras: part.center ? { wheel: true, spinAxis: 'z', radius: part.radius * scale } : { wheel: false } });
}
for (const image of source.images) {
  const v = source.bufferViews[image.bufferView];
  const data = file.subarray(binaryOffset + (v.byteOffset || 0), binaryOffset + (v.byteOffset || 0) + v.byteLength);
  gltf.images.push({ ...image, bufferView: append(data) });
}
gltf.buffers[0].byteLength = byteLength;
const json = Buffer.from(JSON.stringify(gltf)); const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(jsonPadded);
const bin = Buffer.concat(chunks); const header = Buffer.alloc(20); const binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonPadded.length + bin.length, 8);
header.writeUInt32LE(jsonPadded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jsonPadded, binHeader, bin]));
const report = { input, output, triangles: triangles.length, materialCount: 1, textureCount: source.images.length,
  parts: parts.map(p => ({ name: p.name, triangles: p.triangles.length, pivot: p.center ? transform(p.center) : [0, 0, 0], radius: p.radius ? p.radius * scale : null })) };
fs.writeFileSync('output/imagegen/ghn-truck-wheel-split.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
