import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_review

def main():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'motorcycle/csgt-motorcycle-prepared-v1.blend'))
    sc=bpy.context.scene
    # Reimport the exported GLB so validation exercises the actual deliverable.
    old=[o for o in sc.objects if o.type=='MESH'];bpy.data.batch_remove(old)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'motorcycle/csgt-motorcycle-prepared-v1.glb'))
    objs=[o for o in sc.objects if o.type=='MESH']
    assert len(objs)==3,[o.name for o in objs]
    wheels=[o for o in objs if 'wheel-' in o.name]
    assert len(wheels)==2
    records=[];paths=[]
    for degrees in [0,45,90,180,270,360]:
        for o in wheels:
            o.rotation_mode='XYZ';o.rotation_euler[1]=math.radians(degrees)
        bpy.context.view_layer.update()
        records.append({'degrees':degrees,'wheels':[{'name':o.name,'pivot':list(o.matrix_world.translation),'bounds_z':[min((o.matrix_world@v.co).z for v in o.data.vertices),max((o.matrix_world@v.co).z for v in o.data.vertices)]} for o in wheels]})
        if degrees in [0,45,90,180]:
            sc.render.resolution_x=800;sc.render.resolution_y=520
            sc.camera.data.ortho_scale=3
            bx_review._look_at(sc.camera,Vector((0,0,.72)),Vector((0,-1,.13)).normalized(),8)
            sc.render.filepath=str(ROOT/'motorcycle'/f'spin-{degrees}.png');bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    for o in wheels:o.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    for name in [o.name for o in wheels]:
        positions=[Vector(next(w['pivot'] for w in r['wheels'] if w['name']==name)) for r in records]
        assert max((v-positions[0]).length for v in positions)<1e-6
    sweep=[]
    for o in wheels:
        minima=[]
        for degrees in range(0,360,5):
            o.rotation_euler[1]=math.radians(degrees);bpy.context.view_layer.update()
            minima.append(min((o.matrix_world@v.co).z for v in o.data.vertices))
        sweep.append({'name':o.name,'samples':len(minima),'minimum_ground_z':min(minima),'maximum_ground_z':max(minima),'ground_variation':max(minima)-min(minima)})
        assert min(minima)>-.0001 and max(minima)-min(minima)<.003,sweep[-1]
        o.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    bx_review._tile(paths,2,2,str(ROOT/'motorcycle/wheel-spin-review.png'),['0','45','90','180 degrees'])
    # Check independent officer roundtrip, then compose a preview only.
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'officer/csgt-officer-apose-prepared-v1.glb'))
    officer=next(o for o in sc.objects if o.type=='MESH' and o not in objs)
    assert not officer.modifiers and not officer.vertex_groups
    officer.location=(-1.9,-.2,0)
    sc.camera.data.ortho_scale=4.8;sc.render.resolution_x=1400;sc.render.resolution_y=850
    bx_review._look_at(sc.camera,Vector((-.6,0,.88)),Vector((2,-5,1.5)).normalized(),10)
    sc.render.filepath=str(ROOT/'modular-preview.png');bpy.ops.render.render(write_still=True)
    # Actual source GLB artifacts: material modes, bounds, triangles, no external data.
    import struct,hashlib
    summaries=[]
    for file in [ROOT/'motorcycle/csgt-motorcycle-prepared-v1.glb',ROOT/'officer/csgt-officer-apose-prepared-v1.glb']:
        data=file.read_bytes();length=struct.unpack_from('<I',data,12)[0];d=json.loads(data[20:20+length])
        triangles=sum(d['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3 for m in d.get('meshes',[]) for p in m['primitives'])
        external=[r['uri'] for r in d.get('buffers',[])+d.get('images',[]) if r.get('uri') and not r['uri'].startswith('data:')]
        assert not external
        mats=[{'name':m.get('name'),'alphaMode':m.get('alphaMode','OPAQUE')} for m in d.get('materials',[])]
        if 'motorcycle' in file.name:assert any(m['name']=='CSGT_Windscreen' and m['alphaMode']=='BLEND' for m in mats),mats
        summaries.append({'file':str(file.relative_to(ROOT)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':triangles,'meshes':len(d.get('meshes',[])),'primitives':sum(len(m['primitives']) for m in d.get('meshes',[])),'materials':mats,'images':len(d.get('images',[])),'skins':len(d.get('skins',[])),'animations':len(d.get('animations',[])),'external':external})
    result={'deliverables':summaries,'wheel_rotation':records,'full_rotation_sweep':sweep,'scope':'GLB roundtrip and offline render only, not stage integration or performance validation; no humanoid rig yet'}
    (ROOT/'verification.json').write_text(json.dumps(result,indent=2));print('RESULT '+json.dumps(result),flush=True)

if __name__=='__main__':main()
