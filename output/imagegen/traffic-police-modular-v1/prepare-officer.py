import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'officer'
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-rigging/scripts'))
import bx_review,bx_audit,bx_rig as R

def main():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'meshy/model.glb'))
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(objs)==1
    obj=objs[0];obj.name='csgt-officer-apose'
    R.model_check(objs,fix=True,target_height=1.8)
    checked=R.model_check(objs,fix=False)
    assert not checked['problems'],checked
    audit=bx_audit.audit(obj)
    lm=R.landmarks(obj)
    landmarks={k:(list(v) if isinstance(v,Vector) else v) for k,v in lm.items()}
    report={'blender':bpy.app.version_string,'model_check':checked,'audit':audit,'landmarks':landmarks,
            'images':[{'name':i.name,'size':list(i.size)} for i in bpy.data.images if i.type=='IMAGE'],
            'armatures':len([o for o in bpy.context.scene.objects if o.type=='ARMATURE']),
            'status':'independent officer A-pose; prepared geometry, not a tested deformation rig'}
    report['landmark_review']={'accepted_for_binding':False,'reason':'Automatic neck/head landmarks incorrectly fall in the helmet region; shoulder and torso landmarks also require manual placement review. Empty automatic notes are not approval.'}
    (OUT/'audit.json').write_text(json.dumps(report,indent=2))
    sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.view_settings.view_transform='Standard'
    sc.world.use_nodes=True;bg=next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.7,.7,.7,1);bg.inputs['Strength'].default_value=.5
    for name,loc,power in [('Key',(3,-4,5),220),('Fill',(-3,2,4),150)]:
        ld=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,ld);sc.collection.objects.link(o);o.location=loc;ld.energy=power;ld.size=4;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    cd=bpy.data.cameras.new('ReviewCam');cam=bpy.data.objects.new('ReviewCam',cd);sc.collection.objects.link(cam);sc.camera=cam;cd.type='ORTHO';cd.ortho_scale=2.1
    sc.render.resolution_x=650;sc.render.resolution_y=800;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG'
    paths=[]
    for name,d in {'front':(0,-1,0),'back':(0,1,0),'right':(1,0,0),'left':(-1,0,0),'front_3q':(1,-1,.15),'rear_3q':(-1,1,.15)}.items():
        bx_review._look_at(cam,Vector((0,0,.9)),Vector(d).normalized(),5)
        sc.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,2,3,str(OUT/'officer-review.png'),['front','back','right','left','front3q','rear3q'])
    bx_review.review([obj],str(OUT/'geometry-review'),views=('front','right','threequarter'),modes=('matcap','wire'),res=420)
    # Rest-position landmarks are diagnostic only; no claim of working skin weights.
    R.placement_sheet([obj],str(OUT/'landmark-review'),points=[v for v in lm.values() if isinstance(v,Vector)],views=('front','right'),res=600)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(OUT/'csgt-officer-apose-prepared-v1.glb'),export_format='GLB',use_selection=True,export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'csgt-officer-apose-prepared-v1.blend'))
    print('RESULT '+json.dumps({'triangles':audit['tris_equivalent'],'model_check':checked,'landmark_notes':lm.get('notes'),'landmark_keys':list(lm)}),flush=True)

if __name__=='__main__':main()
