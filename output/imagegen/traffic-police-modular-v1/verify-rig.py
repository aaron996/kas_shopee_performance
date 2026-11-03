import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
P=Path(__file__).resolve().parent;O=P/'rig'
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'));import bx_review
def points(o):
    dep=bpy.context.evaluated_depsgraph_get();eo=o.evaluated_get(dep);m=eo.to_mesh();v=[eo.matrix_world@x.co for x in m.vertices];eo.to_mesh_clear();return v
def main():
    bpy.ops.wm.open_mainfile(filepath=str(O/'csgt-officer-rigged-v1.blend'))
    sc=bpy.context.scene;rig=next(o for o in sc.objects if o.type=='ARMATURE');body=next(o for o in sc.objects if o.type=='MESH')
    expected={}
    for name in ['Stand','Ride','Inspect']:
        rig.animation_data.action=bpy.data.actions['CSGT_'+name];sc.frame_set(16);expected[name]=points(body)
    rig.animation_data.action=bpy.data.actions['CSGT_Ride'];sc.frame_set(1)
    rig.rotation_euler[2]=math.pi/2;rig.location=(.05,0,.02)
    bpy.ops.import_scene.gltf(filepath=str(P/'motorcycle/csgt-motorcycle-prepared-v1.glb'))
    sc.render.resolution_x=1000;sc.render.resolution_y=800;sc.camera.data.ortho_scale=3.25
    paths=[]
    for n,d in [('side',(0,-1,.12)),('front',(1,0,.15)),('3q',(1,-1,.5))]:
        bx_review._look_at(sc.camera,Vector((0,0,1.05)),Vector(d).normalized(),8);sc.render.filepath=str(O/f'riding-on-bike-{n}.png');bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,1,3,str(O/'riding-on-bike-sheet.png'),['side','front','3q'])
    # Test the exported file, not just the authoring rig. Frame timing kept at 30 fps.
    bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene;sc.render.fps=30
    bpy.ops.import_scene.gltf(filepath=str(O/'csgt-officer-rigged-v1.glb'))
    rig=next(o for o in sc.objects if o.type=='ARMATURE');body=next(o for o in sc.objects if o.type=='MESH')
    results=[]
    for name in ['Stand','Ride','Inspect']:
        action=next(a for a in bpy.data.actions if a.name.startswith('CSGT_'+name));rig.animation_data_create();rig.animation_data.action=action;sc.frame_set(16)
        actual=points(body);kd=KDTree(len(actual))
        for i,v in enumerate(actual):kd.insert(v,i)
        kd.balance();error=max(kd.find(v)[2] for v in expected[name]);assert error<.001,(name,error)
        samples=[]
        for frame in [1,8,16,24,31,39,46,54,61]:
            sc.frame_set(frame);vs=points(body);assert all(math.isfinite(c) for v in vs for c in v)
            samples.append({'frame':frame,'bounds':[[min(v[k] for v in vs),max(v[k] for v in vs)] for k in range(3)]})
        results.append({'clip':action.name,'roundtrip_max_vertex_error':error,'samples':samples})
    # Parse file skin metadata separately to check the runtime contract.
    import struct
    b=(O/'csgt-officer-rigged-v1.glb').read_bytes();l=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+l]);assert len(d.get('skins',[]))==1 and len(d.get('animations',[]))==3
    report={'skin_count':len(d['skins']),'joint_count':len(d['skins'][0]['joints']),'clips':[a['name'] for a in d['animations']],'bytes':len(b),'roundtrip':results,'limits':'offline sampled validation, pose clips only; no dismount/walk or runtime tests'}
    (O/'verification.json').write_text(json.dumps(report,indent=2));print('RESULT '+json.dumps({k:v for k,v in report.items() if k!='roundtrip'}),flush=True)
if __name__=='__main__':main()
