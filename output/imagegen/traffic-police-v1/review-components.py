import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'review'/'all-components'
OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_review
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'review/csgt-audit.blend'))
sc=bpy.context.scene
sc.render.engine='BLENDER_WORKBENCH'
sc.render.resolution_x=sc.render.resolution_y=240
sc.display.shading.light='FLAT'
sc.display.shading.color_type='TEXTURE'
sc.display.shading.background_type='WORLD'
sc.world.color=(.7,.7,.7)
sc.camera.data.type='ORTHO'
for o in sc.objects:
    if o.type=='MESH':o.hide_render=True
pieces=sorted([o for o in sc.objects if o.name.startswith('Part_')],key=lambda p:int(p.name.split('_')[1]))
for p in pieces:
    p.hide_set(False);p.hide_render=False
    lo=Vector([min(v.co[j] for v in p.data.vertices) for j in range(3)])
    hi=Vector([max(v.co[j] for v in p.data.vertices) for j in range(3)])
    center=(lo+hi)/2;size=max(hi-lo)
    sc.camera.data.ortho_scale=size*1.45
    bx_review._look_at(sc.camera,center,Vector((-1,-1,.55)).normalized(),4)
    sc.render.filepath=str(OUT/(p.name+'.png'))
    bpy.ops.render.render(write_still=True)
    p.hide_render=True;p.hide_set(True)
print('RESULT '+json.dumps({'count':len(pieces)}),flush=True)
