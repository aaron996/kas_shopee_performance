import json
import pathlib
import struct
from collections import Counter

root = pathlib.Path(__file__).parent
file = root / 'meshy-t2' / 'model.glb'
data = file.read_bytes()
assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
length = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + length])
binary = data[28 + length:]

def read_accessor(index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    size = struct.calcsize('<' + fmt * width)
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', size)
    return [struct.unpack_from('<' + fmt * width, binary, offset + i * stride) for i in range(a['count'])]

parts = []
for mesh in doc.get('meshes', []):
    for primitive in mesh['primitives']:
        assert primitive.get('mode', 4) == 4
        positions = read_accessor(primitive['attributes']['POSITION'])
        indices = [v[0] for v in read_accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
        parent = list(range(len(positions)))
        def find(v):
            while parent[v] != v:
                parent[v] = parent[parent[v]]
                v = parent[v]
            return v
        def union(a, b):
            parent[find(a)] = find(b)
        # Weld matching positions to avoid counting UV/normal seams as distinct parts.
        seen = {}
        for i, p in enumerate(positions):
            key = tuple(round(x, 6) for x in p)
            if key in seen:
                union(i, seen[key])
            else:
                seen[key] = i
        for i in range(0, len(indices), 3):
            union(indices[i], indices[i+1])
            union(indices[i], indices[i+2])
        counts = Counter(find(indices[i]) for i in range(0, len(indices), 3))
        parts.append({'mesh': mesh.get('name'), 'triangles': len(indices)//3,
                      'connected_components_after_position_weld': len(counts),
                      'largest_component_triangles': sorted(counts.values(), reverse=True)[:30]})
result = {'bytes': len(data), 'triangles': sum(p['triangles'] for p in parts),
          'meshes': len(doc.get('meshes', [])), 'nodes': len(doc.get('nodes', [])),
          'materials': len(doc.get('materials', [])), 'images': len(doc.get('images', [])),
          'skins': len(doc.get('skins', [])), 'animations': len(doc.get('animations', [])),
          'parts': parts,
          'limitation': 'Connected components are geometric evidence only; they do not identify a complete officer or prove animation readiness.'}
(root/'inspection.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
