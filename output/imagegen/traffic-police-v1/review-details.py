import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'review'
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_review

def main():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'csgt-audit.blend'))
    sc=bpy.context.scene; obj=bpy.data.objects['CSGT_Source']; cam=sc.camera
    for o in sc.objects:
        if o.type=='LIGHT': o.data.energy *= .12
    sc.world.node_tree.nodes.get('Background')
    bg=next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Strength'].default_value=.45
    sc.render.engine='BLENDER_EEVEE'; sc.render.resolution_x=800; sc.render.resolution_y=650
    sc.render.film_transparent=False
    center=Vector((0,0,0)); cam.data.ortho_scale=1.16
    directions={'front':(-1,0,.12),'back':(1,0,.12),'side_a':(0,-1,.12),'side_b':(0,1,.12),'front_3q':(-1,-1,.5),'rear_3q':(1,1,.5)}
    paths=[]
    for name,d in directions.items():
        bx_review._look_at(cam,center,Vector(d).normalized(),4)
        sc.render.filepath=str(OUT/f'neutral_{name}.png')
        bpy.ops.render.render(write_still=True); paths.append(sc.render.filepath)
    bx_review._tile(paths,2,3,str(OUT/'neutral-sheet.png'),list(directions))
    pieces=sorted([o for o in sc.objects if o.name.startswith('Part_')],key=lambda p:int(p.name.split('_')[1]))
    obj.hide_render=True
    # Officer isolation reveals geometry fused to the character component.
    for name in ['Part_00','Part_06']:
        bpy.data.objects[name].hide_render=False; bpy.data.objects[name].hide_set(False)
    cam.data.ortho_scale=.8
    c=Vector((-.1,0,.06)); paths=[]
    for name,d in [('side',(0,-1,.1)),('front',(-1,0,.15)),('threequarter',(-1,-1,.35))]:
        bx_review._look_at(cam,c,Vector(d).normalized(),4)
        sc.render.filepath=str(OUT/f'officer-isolated-{name}.png')
        bpy.ops.render.render(write_still=True); paths.append(sc.render.filepath)
    bx_review._tile(paths,1,3,str(OUT/'officer-isolated-sheet.png'),['Body component + helmet / '+n for n in ['side','front','threequarter']])
    for p in pieces: p.hide_render=True; p.hide_set(True)
    groups=[]
    for name,cx,cz,r in [('rear',.3275685,-.232146,.142),('front',-.3765815,-.2312515,.138)]:
        group=[]
        for p in pieces:
            if all(abs(v.co.y)<.04 and math.hypot(v.co.x-cx,v.co.z-cz)<r for v in p.data.vertices): group.append(p)
        groups.append({'name':name,'center':[cx,0,cz],'radius_limit':r,'parts':[p.name for p in group],'triangles':sum(len(p.data.polygons) for p in group)})
        paths=[]
        for angle in [0,45]:
            for p in group:
                p.hide_set(False); p.hide_render=False
                p.rotation_mode='XYZ'
                p.rotation_euler[1]=math.radians(angle)
                pivot=Vector((cx,0,cz))
                p.location=pivot-Quaternion((0,1,0),math.radians(angle))@pivot
            cam.data.ortho_scale=.35
            bx_review._look_at(cam,Vector((cx,0,cz)),Vector((0,-1,.02)).normalized(),2)
            sc.render.filepath=str(OUT/f'{name}-wheel-{angle}.png')
            bpy.ops.render.render(write_still=True); paths.append(sc.render.filepath)
        bx_review._tile(paths,1,2,str(OUT/f'{name}-wheel-test.png'),[f'{name} wheel {a} degrees' for a in [0,45]])
        for p in group:
            p.rotation_euler=(0,0,0); p.location=(0,0,0); p.hide_render=True; p.hide_set(True)
    (OUT/'wheel-groups.json').write_text(json.dumps(groups,indent=2))
    # Direct style comparison using the current runtime GHN rider, in the same lighting.
    obj.hide_render=False
    bpy.ops.import_scene.gltf(filepath=str(ROOT.parents[2]/'public/models/ghn-bc-rider-wheels-v1.glb'))
    ref=[o for o in sc.objects if o.type=='MESH' and o != obj and not o.name.startswith('Part_')]
    # Runtime GLB has glTF Y up -> Blender Z up, driving +X. Normalize lengths for visual comparison only.
    pts=[o.matrix_world@Vector(c) for o in ref for c in o.bound_box]
    lo=Vector([min(p[i] for p in pts) for i in range(3)]); hi=Vector([max(p[i] for p in pts) for i in range(3)])
    scale=1/(hi.x-lo.x)
    for o in ref:
        mw=o.matrix_world.copy(); mw.translation-= (lo+hi)/2; mw.translation*=scale
        for i in range(3):
            for j in range(3): mw[i][j]*=scale
        o.matrix_world=mw
        o.hide_render=True
    paths=[]; cam.data.ortho_scale=1.2
    for name,targets,d in [('csgt',[obj],(0,-1,.2)),('ghn_rider',ref,(0,1,.2))]:
        obj.hide_render=True
        for o in targets: o.hide_render=False
        bx_review._look_at(cam,Vector((0,0,0)),Vector(d).normalized(),4)
        sc.render.filepath=str(OUT/f'compare-{name}.png'); bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
        for o in targets:o.hide_render=True
    bx_review._tile(paths,1,2,str(OUT/'style-comparison.png'),['CSGT source','Current runtime GHN rider, normalized length'])
    print('RESULT '+json.dumps({'wheels':groups}),flush=True)

if __name__=='__main__':main()
