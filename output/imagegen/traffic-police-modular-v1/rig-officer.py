import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'rig';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-rigging/scripts'))
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_rig as R,bx_review

def smooth(a,b,t):
    t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)

def main():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'officer/csgt-officer-apose-prepared-v1.blend'))
    sc=bpy.context.scene;obj=next(o for o in sc.objects if o.type=='MESH')
    rig=R.new_armature('CSGT_Rig');R.activate(rig);bpy.ops.object.mode_set(mode='EDIT');eb=rig.data.edit_bones
    specs=[('root',(0,0,0),(0,0,.15),None,False),('pelvis',(0,.04,.85),(0,.04,.98),'root',True),('spine',(0,.04,.98),(0,.03,1.17),'pelvis',True),('chest',(0,.03,1.17),(0,.02,1.36),'spine',True),('neck',(0,.02,1.36),(0,.015,1.46),'chest',True),('head',(0,.015,1.46),(0,.015,1.76),'neck',True)]
    for s,suffix in [(1,'L'),(-1,'R')]:
        specs += [(f'clavicle.{suffix}',(0,.02,1.32),(s*.18,.04,1.34),'chest',True),
                  (f'upper_arm.{suffix}',(s*.18,.04,1.34),(s*.32,.05,1.105),f'clavicle.{suffix}',True),
                  (f'forearm.{suffix}',(s*.32,.05,1.105),(s*.437,.05,.933),f'upper_arm.{suffix}',True),
                  (f'hand.{suffix}',(s*.437,.05,.933),(s*.49,.04,.85),f'forearm.{suffix}',True),
                  (f'thigh.{suffix}',(s*.09,.04,.90),(s*.112,.068,.506),'pelvis',True),
                  (f'shin.{suffix}',(s*.112,.068,.506),(s*.133,.074,.108),f'thigh.{suffix}',True),
                  (f'foot.{suffix}',(s*.133,.074,.108),(s*.16,-.13,.055),f'shin.{suffix}',True)]
    for n,h,t,p,d in specs:R.new_bone(eb,n,h,t,parent=p,deform=d,roll_z=(0,1,0))
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
    R.placement_sheet([obj],str(OUT/'placement'),arm_obj=rig,views=('front','right','top'),res=650)
    # Deterministic spatial weights, same computation on seam duplicates.
    names=[b.name for b in rig.data.bones if b.use_deform];groups={n:obj.vertex_groups.new(name=n) for n in names}
    for v in obj.data.vertices:
        x,y,z=v.co;side='L' if x>=0 else 'R';ax=abs(x);w={}
        def mix(a,b,t):return {a:1-t,b:t}
        if z>1.42:w=mix('neck','head',smooth(1.42,1.48,z))
        elif z<.88:
            if z<.19:w=mix(f'foot.{side}',f'shin.{side}',smooth(.11,.20,z))
            elif z<.60:w=mix(f'shin.{side}',f'thigh.{side}',smooth(.44,.57,z))
            else:w=mix(f'thigh.{side}','pelvis',smooth(.79,.9,z))
        else:
            torso=mix('pelvis','spine',smooth(.94,1.08,z)) if z<1.1 else mix('spine','chest',smooth(1.10,1.24,z))
            if z>1.33:torso=mix('chest','neck',smooth(1.34,1.44,z))
            # Arms are spatially distinct from torso below sleeves in A-pose.
            armness=smooth(.16,.245,ax) if z>.97 else smooth(.23,.34,ax)
            if ax>.42:arm=mix(f'forearm.{side}',f'hand.{side}',smooth(.42,.46,ax))
            else:arm=mix(f'upper_arm.{side}',f'forearm.{side}',smooth(.285,.35,ax))
            w={n:t*(1-armness) for n,t in torso.items()}
            for n,t in arm.items():w[n]=w.get(n,0)+t*armness
        # Hands extend below crotch height; override the leg zone there.
        if ax>.39 and z<1.01:w=mix(f'forearm.{side}',f'hand.{side}',smooth(.42,.46,ax))
        w={n:t for n,t in w.items() if t>.001};w=dict(sorted(w.items(),key=lambda kv:-kv[1])[:4]);total=sum(w.values())
        for n,t in w.items():groups[n].add([v.index],t/total,'REPLACE')
    # Isolated radio, antenna, belt/buckle/loops move rigidly with the pelvis.
    accessory_records=json.loads((OUT/'accessory-components.json').read_text())
    rigid_ids=[]
    for record in accessory_records:
        cx,cy,cz=record['center']
        if abs(cx)<.23 and ((.95<cz<1.07 and record['verts']<120) or (cx<-.15 and 1.05<cz<1.14 and record['verts']<100)):
            ids=record['indices'];rigid_ids.extend(ids)
            for group in groups.values():group.remove(ids)
            groups['pelvis'].add(ids,1.0,'REPLACE')
    mod=obj.modifiers.new('CSGT_Skin','ARMATURE');mod.object=rig;obj.parent=rig
    wr=R.weight_report(obj,rig,expect_inside=False)
    assert wr['unweighted']==0 and wr['over4']==0 and wr['sum_dev']==0,wr
    def ik(upper,lower,target,pole):
        bpy.context.view_layer.update();pb=rig.pose.bones[upper];a=pb.head.copy();t=Vector(target);d=t-a;dist=min(d.length,rig.data.bones[upper].length+rig.data.bones[lower].length-.0005);axis=d.normalized()
        l1=rig.data.bones[upper].length;l2=rig.data.bones[lower].length
        u=(l1*l1-l2*l2+dist*dist)/(2*dist);h=math.sqrt(max(0,l1*l1-u*u));p=Vector(pole)-a;p=(p-axis*p.dot(axis)).normalized();elbow=a+axis*u+p*h
        R.aim(rig,upper,elbow-a);bpy.context.view_layer.update();R.aim(rig,lower,t-rig.pose.bones[lower].head)
    def pose(name,phase=0):
        R.reset_pose(rig)
        if name=='Ride':
            for s,suf in [(1,'L'),(-1,'R')]:
                ik('thigh.'+suf,'shin.'+suf,(s*.25,-.08,.40),(s*.2,-1,.75));R.aim(rig,'foot.'+suf,(0,-1,-.03))
                ik('upper_arm.'+suf,'forearm.'+suf,(s*.3125,-.3375,1.065),(s*.8,-.1,1.0));R.aim(rig,'hand.'+suf,(0,-1,0))
        elif name=='Inspect':
            for s,suf in [(1,'L'),(-1,'R')]:
                ik('upper_arm.'+suf,'forearm.'+suf,(s*.11,-.32,1.03+phase*.012),(s*.6,-.08,.92));R.aim(rig,'hand.'+suf,(0,-1,.06))
            R.rotate_world(rig,'head',__import__('mathutils').Quaternion((1,0,0),math.radians(12)))
        elif name=='Stand':
            for s,suf in [(1,'L'),(-1,'R')]:
                R.aim(rig,'upper_arm.'+suf,(s*.10,0,-1));R.aim(rig,'forearm.'+suf,(0,-.03,-1));R.aim(rig,'hand.'+suf,(0,-.03,-1))
            R.rotate_world(rig,'chest',__import__('mathutils').Quaternion((0,1,0),math.radians(phase*.6)))
        bpy.context.view_layer.update()
    paths=[];sc.render.resolution_x=650;sc.render.resolution_y=800;sc.camera.data.ortho_scale=2.1
    for n in ['Stand','Ride','Inspect']:
        pose(n)
        for view,d in [('front',(0,-1,.05)),('side',(1,0,.05)),('3q',(1,-1,.15))]:
            bx_review._look_at(sc.camera,Vector((0,0,.9)),Vector(d).normalized(),5);sc.render.filepath=str(OUT/f'{n}-{view}.png');bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,3,3,str(OUT/'pose-review.png'),[f'{n}/{v}' for n in ['Stand','Ride','Inspect'] for v in ['front','side','3q']])
    # Small repeatable pose clips; no dismount/walk motion claimed.
    for n in ['Stand','Ride','Inspect']:
        rig.animation_data_create();action=bpy.data.actions.new('CSGT_'+n);rig.animation_data.action=action
        for frame,phase in [(1,0),(16,1),(31,0),(46,-1),(61,0)]:
            pose(n,phase)
            for pb in rig.pose.bones:pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name);pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
        action.use_fake_user=True
    rig.animation_data.action=None;R.reset_pose(rig)
    sc.render.fps=30;sc.frame_start=1;sc.frame_end=61
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(OUT/'csgt-officer-rigged-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_def_bones=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'csgt-officer-rigged-v1.blend'))
    (OUT/'rig-report.json').write_text(json.dumps({'weights':wr,'rigid_pelvis_vertices':len(set(rigid_ids)),'bones':[{'name':n,'head':h,'tail':t,'parent':p,'deform':d} for n,h,t,p,d in specs],'method':'manually placed compact FK skeleton; analytic spatial skin weights; three pose clips pending visual acceptance','limitations':['No finger or facial rig','No walking/dismount clip','No runtime integration']},indent=2))
    print('RESULT '+json.dumps(wr),flush=True)
if __name__=='__main__':main()
