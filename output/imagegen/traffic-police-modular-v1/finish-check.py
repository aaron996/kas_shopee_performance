import bpy,sys,json,struct,math
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent;O=P/'animation'
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'));import bx_review
def evaluated(o):
    eo=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=eo.to_mesh();v=[eo.matrix_world@x.co for x in m.vertices];eo.to_mesh_clear();return v
def main():
    bpy.ops.wm.open_mainfile(filepath=str(O/'csgt-check-sequence-v1.blend'))
    sc=bpy.context.scene;rig=next(o for o in sc.objects if o.type=='ARMATURE');body=next(o for o in sc.objects if o.type=='MESH' and o.parent==rig)
    action=rig.animation_data.action
    bpy.ops.mesh.primitive_cube_add(size=1);paper=bpy.context.object;paper.name='InspectionPaper';paper.dimensions=(.17,.12,.003);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    paper.parent=rig;paper.location=(.75,-5.1975,1.04)
    mat=bpy.data.materials.new('PaperIvory');bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=(.88,.86,.78,1);bs.inputs['Roughness'].default_value=.9;paper.data.materials.append(mat)
    paper.animation_data_create();paper.animation_data.action=action;paper.animation_data.action_slot=action.slots.new(id_type='OBJECT',name='InspectionPaper')
    for f,scale in [(1,0),(210,0),(218,1),(260,1),(274,0),(511,0)]:paper.scale=(scale,)*3;paper.keyframe_insert(data_path='scale',frame=f)
    # Evaluate foot clearance and continuity; keep evidence even if a quality gate fails.
    footids={}
    for name in ['L','R']:
        gi=body.vertex_groups['foot.'+name].index
        footids[name]=[v.index for v in body.data.vertices if any(g.group==gi and g.weight>.5 for g in v.groups)]
    measures=[]
    for f in range(1,512,5):
        sc.frame_set(f);v=evaluated(body);assert all(math.isfinite(c) for p in v for c in p)
        measures.append({'frame':f,'boot_min_z':{s:min(v[i].z for i in ids) for s,ids in footids.items()}})
    bpy.ops.object.select_all(action='DESELECT')
    # Object transform is the scene attachment, not part of the independent file.
    rig.rotation_euler=(0,0,0);rig.location=(0,0,0);sc.frame_set(1)
    for o in [rig,body,paper]:o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(O/'csgt-check-sequence-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_def_bones=False)
    rig.rotation_euler[2]=math.pi/2;rig.location=(.05,0,.02)
    sc.frame_set(235);sc.render.resolution_x=1100;sc.render.resolution_y=800;sc.camera.data.ortho_scale=3.6
    bx_review._look_at(sc.camera,Vector((4.5,.4,1)),Vector((1,2,.6)).normalized(),9)
    sc.render.filepath=str(O/'inspection-paper.png');bpy.ops.render.render(write_still=True)
    sc.camera.data.ortho_scale=8;bx_review._look_at(sc.camera,Vector((2.3,.3,1)),Vector((1,2,.55)).normalized(),14)
    sc.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(O/'csgt-check-sequence-v1.blend'))
    sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.color_type='TEXTURE';sc.display.shading.light='STUDIO';sc.display.shading.background_type='WORLD';sc.world.color=(.65,.65,.65)
    sc.render.resolution_x=700;sc.render.resolution_y=540
    for f in range(1,512,3):
        sc.frame_set(f);sc.render.filepath=str(O/'frames'/f'{f:03}.png');bpy.ops.render.render(write_still=True)
    # GLB metadata plus an independent importer test.
    b=(O/'csgt-check-sequence-v1.glb').read_bytes();l=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+l]);clips=[a['name'] for a in doc.get('animations',[])];assert len(clips)==1,clips
    bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene;sc.render.fps=30
    bpy.ops.import_scene.gltf(filepath=str(O/'csgt-check-sequence-v1.glb'))
    r=next(o for o in sc.objects if o.type=='ARMATURE');obj=next(o for o in sc.objects if o.type=='MESH' and 'Paper' not in o.name);prop=next(o for o in sc.objects if o.type=='MESH' and 'Paper' in o.name)
    checks=[]
    for f in [1,70,120,160,200,235,285,335,430,481,511]:
        sc.frame_set(f);v=evaluated(obj);assert all(math.isfinite(c) for p in v for c in p);checks.append({'frame':f,'paper_scale':list(prop.scale),'bounds':[[min(p[k] for p in v),max(p[k] for p in v)] for k in range(3)]})
    assert max(checks[5]['paper_scale'])>.9 and max(checks[0]['paper_scale'])<.001
    report={'bytes':len(b),'clips':clips,'skin_count':len(doc['skins']),'joint_count':len(doc['skins'][0]['joints']),'duration_seconds':17,'fps':30,'frame_range':[1,511],'boot_clearance':measures,'import_checks':checks,'status':'blocking / motion prototype, not final quality approval','min_sampled_boot_z':min(v for m in measures for v in m['boot_min_z'].values())}
    (O/'verification.json').write_text(json.dumps(report,indent=2));print('RESULT '+json.dumps({k:v for k,v in report.items() if k not in ['boot_clearance','import_checks']}),flush=True)
if __name__=='__main__':main()
