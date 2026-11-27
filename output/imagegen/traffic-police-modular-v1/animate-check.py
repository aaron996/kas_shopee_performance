import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
P=Path(__file__).resolve().parent;O=P/'animation';O.mkdir(exist_ok=True)
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-rigging/scripts'))
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_rig as R,bx_review
def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)
def ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
def path(keys,t):
    for (a,p),(b,q) in zip(keys,keys[1:]):
        if t<=b:return lerp(p,q,ease((t-a)/(b-a)))
    return Vector(keys[-1][1])
def main():
    bpy.ops.wm.open_mainfile(filepath=str(P/'rig/csgt-officer-rigged-v1.blend'))
    sc=bpy.context.scene;rig=next(o for o in sc.objects if o.type=='ARMATURE');body=next(o for o in sc.objects if o.type=='MESH')
    rig.animation_data.action=None
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    action=bpy.data.actions.new('CSGT_CheckSequence');rig.animation_data.action=action
    footids={}
    for suf in ['L','R']:
        gi=body.vertex_groups['foot.'+suf].index
        footids[suf]=[v.index for v in body.data.vertices if any(g.group==gi and g.weight>.5 for g in v.groups)]
    def ik(u,l,t,pole):
        bpy.context.view_layer.update();a=rig.pose.bones[u].head.copy();target=Vector(t);d=target-a;length=d.length;axis=d.normalized();l1=rig.data.bones[u].length;l2=rig.data.bones[l].length;dist=min(length,l1+l2-.0001)
        x=(l1*l1-l2*l2+dist*dist)/(2*dist);h=math.sqrt(max(0,l1*l1-x*x));v=Vector(pole)-a;v=(v-axis*v.dot(axis)).normalized();elbow=a+axis*x+v*h
        R.aim(rig,u,elbow-a);R.aim(rig,l,target-rig.pose.bones[l].head)
    def pose(f):
        R.reset_pose(rig);offset=Vector((0,0,0));yaw=0;mode='ride';feet={};handblend=0
        if 30<f<120 or 391<=f<481:
            t=(f-30)/90 if f<120 else 1-(f-391)/90
            mode='dismount';offset=path([(0,(0,0,0)),(.32,(.25,0,-.08)),(.67,(.58,.05,-.08)),(1,(.75,.05,-.02))],t)
            feet['L']=path([(0,(.25,-.08,.40)),(.35,(.52,.03,.088)),(1,(.88,.124,.088))],t)
            feet['R']=path([(0,(-.25,-.08,.40)),(.28,(-.25,-.02,.48)),(.52,(.10,.30,1.12)),(.72,(.55,.24,.70)),(1,(.62,.124,.088))],t)
            handblend=ease((t-.15)/.45)
        elif 120<=f<200 or 293<=f<373:
            returning=f>=293;t=(f-(293 if returning else 120))/80;mode='walk';yaw=math.pi if returning else 0
            start=Vector((.75,-4.825 if returning else .05,-.02));rot=Quaternion((0,0,1),yaw)
            n=min(7,int(t*8));q=t*8-n;travel=.65
            footys={'L':.074,'R':.074}
            for j in range(n):footys['L' if j%2==0 else 'R']-=travel*2 if j>0 else travel
            moving='L' if n%2==0 else 'R';old=footys[moving];target=old-(travel*2 if n>0 else travel);footys[moving]=old+(target-old)*ease(q)
            mid=(footys['L']+footys['R'])/2-.074
            offset=start+rot@Vector((0,mid,0))
            for s,suf in [(1,'L'),(-1,'R')]:
                z=.088+(.075*math.sin(math.pi*q) if suf==moving else 0)
                feet[suf]=start+rot@Vector((s*.13,footys[suf],z+.02))
                if t>.85:
                    settle=ease((t-.85)/.15)
                    endpoint=start+rot@Vector((s*.13,-4.875+.074,.108))
                    feet[suf]=feet[suf].lerp(endpoint,settle)
            handblend=1
        elif 200<=f<293:
            mode='inspect' if f<275 else 'turn';offset=Vector((.75,-4.825,-.02));yaw=math.pi*ease((f-275)/18) if f>=275 else 0;handblend=1
        elif 373<=f<391:
            mode='turn';offset=Vector((.75,.05,-.02));yaw=math.pi*(1-ease((f-373)/18));handblend=1
        root=rig.pose.bones['root'];root.matrix=Matrix.Translation(offset)@Quaternion((0,0,1),yaw).to_matrix().to_4x4()@root.bone.matrix_local
        bpy.context.view_layer.update();rot=Quaternion((0,0,1),yaw)
        if mode=='ride':
            feet={'L':Vector((.25,-.08,.40)),'R':Vector((-.25,-.08,.40))}
        for s,suf in [(1,'L'),(-1,'R')]:
            if suf not in feet:feet[suf]=offset+rot@Vector((s*.13,.074,.108))
            ik('thigh.'+suf,'shin.'+suf,feet[suf],offset+rot@Vector((s*.2,-1,.7)))
            R.aim(rig,'foot.'+suf,rot@Vector((0,-1,-.26)))
            if feet[suf].z<.135:
                for attempt in range(2):
                    bpy.context.view_layer.update();eo=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=eo.to_mesh()
                    lowest=min(mesh.vertices[i].co.z for i in footids[suf]);eo.to_mesh_clear()
                    correction=max(0,-.019-lowest)
                    if correction<.0001:break
                    feet[suf].z+=correction
                    ik('thigh.'+suf,'shin.'+suf,feet[suf],offset+rot@Vector((s*.2,-1,.7)))
                    R.aim(rig,'foot.'+suf,rot@Vector((0,-1,-.26)))
            if mode=='ride' or mode=='dismount' and handblend<1:
                t=handblend;target=lerp((s*.3125,-.2875,1.065),offset+Vector((s*.22,-.05,.88)),t)
                ik('upper_arm.'+suf,'forearm.'+suf,target,offset+Vector((s*.8,-.1,1)))
                R.aim(rig,'hand.'+suf,Vector((0,-1,0)).lerp(Vector((0,0,-1)),t))
            elif mode=='inspect':
                t=ease((f-200)/15)*ease((275-f)/15);target=offset+lerp((s*.22,0,.88),(s*.10,-.30,1.04+.008*math.sin(f*.08)),t)
                ik('upper_arm.'+suf,'forearm.'+suf,target,offset+Vector((s*.6,-.1,.94)));R.aim(rig,'hand.'+suf,lerp((0,0,-1),(0,-1,.03),t))
                R.rotate_world(rig,'head',Quaternion((1,0,0),math.radians(10)*t)) if s==1 else None
            else:
                swing=.12*math.sin((f-120)*math.pi/20)*(1 if s==1 else -1) if mode=='walk' else 0
                R.aim(rig,'upper_arm.'+suf,rot@Vector((s*.08,swing,-1)));R.aim(rig,'forearm.'+suf,rot@Vector((0,-.05,-1)));R.aim(rig,'hand.'+suf,rot@Vector((0,-.02,-1)))
        return mode
    records=[]
    for f in range(1,512):
        sc.frame_set(f);mode=pose(f)
        for pb in rig.pose.bones:pb.keyframe_insert(data_path='location',frame=f,group=pb.name);pb.keyframe_insert(data_path='rotation_quaternion',frame=f,group=pb.name)
        if f%10==1:records.append({'frame':f,'mode':mode,'feet':[list(rig.pose.bones['foot.'+s].head) for s in ['L','R']]})
    # Dense authored keys: linear interpolation avoids unintended overshoot between samples.
    from bpy_extras.anim_utils import action_get_channelbag_for_slot
    bag=action_get_channelbag_for_slot(action,rig.animation_data.action_slot)
    for fc in bag.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
    sc.render.fps=30;sc.frame_start=1;sc.frame_end=511
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
    sc.frame_set(1)
    bpy.ops.export_scene.gltf(filepath=str(O/'csgt-check-sequence-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_def_bones=False)
    rig.rotation_euler[2]=math.pi/2;rig.location=(.05,0,.02)
    bpy.ops.import_scene.gltf(filepath=str(P/'motorcycle/csgt-motorcycle-prepared-v1.glb'))
    sc.camera.data.ortho_scale=4.4;sc.render.resolution_x=900;sc.render.resolution_y=700
    bx_review._look_at(sc.camera,Vector((2.3,.3,1)),Vector((1,-2,.65)).normalized(),14)
    sc.camera.data.ortho_scale=8
    paths=[];keyframes=[1,60,80,120,160,200,235,285,335,385,430,481]
    for f in keyframes:
        sc.frame_set(f);sc.render.filepath=str(O/f'key-{f:03}.png');bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,3,4,str(O/'sequence-sheet.png'),[str(f) for f in keyframes])
    bx_review._look_at(sc.camera,Vector((2.3,.3,1)),Vector((1,2,.55)).normalized(),14)
    paths=[]
    for f in [30,50,70,90,110,120,140,180,200]:
        sc.frame_set(f);sc.render.filepath=str(O/f'contact-{f:03}.png');bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,3,3,str(O/'contact-review.png'),[str(f) for f in [30,50,70,90,110,120,140,180,200]])
    sc.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(O/'csgt-check-sequence-v1.blend'))
    # Texture workbench playblast frames for offline motion review.
    sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.color_type='TEXTURE';sc.display.shading.light='STUDIO';sc.display.shading.background_type='WORLD';sc.world.color=(.65,.65,.65)
    sc.render.resolution_x=700;sc.render.resolution_y=540
    frames=O/'frames';frames.mkdir(exist_ok=True)
    for f in range(1,512,3):sc.frame_set(f);sc.render.filepath=str(frames/f'{f:03}.png');bpy.ops.render.render(write_still=True)
    (O/'motion-samples.json').write_text(json.dumps(records,indent=2));print('RESULT sequence authored 511 frames',flush=True)
if __name__=='__main__':main()
