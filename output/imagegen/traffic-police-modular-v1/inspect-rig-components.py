import bpy,json
from pathlib import Path
P=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(P/'rig/csgt-officer-rigged-v1.blend'))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');m=o.data
parents=list(range(len(m.vertices)))
def find(i):
    while i!=parents[i]:parents[i]=parents[parents[i]];i=parents[i]
    return i
def union(i,j):parents[find(i)]=find(j)
seen={}
for v in m.vertices:
    k=tuple(round(x,5) for x in v.co)
    if k in seen:union(v.index,seen[k])
    else:seen[k]=v.index
for e in m.edges:union(*e.vertices)
cs={}
for v in m.vertices:cs.setdefault(find(v.index),[]).append(v)
result=[]
for vs in cs.values():
    lo=[min(v.co[k] for v in vs) for k in range(3)];hi=[max(v.co[k] for v in vs) for k in range(3)];c=[(lo[k]+hi[k])/2 for k in range(3)]
    if .8<c[2]<1.2:result.append({'verts':len(vs),'center':c,'lo':lo,'hi':hi,'indices':[v.index for v in vs]})
(P/'rig/accessory-components.json').write_text(json.dumps(result,indent=2))
print('RESULT '+json.dumps([{k:v for k,v in r.items() if k!='indices'} for r in result]),flush=True)
