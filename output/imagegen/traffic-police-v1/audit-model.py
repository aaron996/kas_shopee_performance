import bpy, bmesh, json, sys, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'review'
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_audit, bx_review

def main():
    print('VERSION', bpy.app.version_string, flush=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'meshy-t2/model.glb'))
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    obj.name = 'CSGT_Source'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    source = bx_audit.audit(obj)
    images = [{'name': i.name, 'size': list(i.size), 'packed': bool(i.packed_file)} for i in bpy.data.images if i.type != 'RENDER_RESULT']
    bounds = [[min(v.co[i] for v in obj.data.vertices), max(v.co[i] for v in obj.data.vertices)] for i in range(3)]
    print('SOURCE', json.dumps({'bounds': bounds,'audit':source,'images':images}), flush=True)
    # Diagnostic copy only: weld glTF seam vertices, then separate connected geometry.
    split = obj.copy()
    split.data = obj.data.copy()
    bpy.context.collection.objects.link(split)
    split.name = 'CSGT_Diagnostic'
    bm = bmesh.new()
    bm.from_mesh(split.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=max(obj.dimensions)*1e-6)
    bm.to_mesh(split.data)
    bm.free()
    welded = bx_audit.audit(split)
    bpy.ops.object.select_all(action='DESELECT')
    split.select_set(True)
    bpy.context.view_layer.objects.active = split
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = sorted([o for o in bpy.context.scene.objects if o.type=='MESH' and o != obj], key=lambda o:len(o.data.polygons), reverse=True)
    components = []
    for i, p in enumerate(pieces):
        p.name = f'Part_{i:02}'
        lo = Vector([min(v.co[j] for v in p.data.vertices) for j in range(3)])
        hi = Vector([max(v.co[j] for v in p.data.vertices) for j in range(3)])
        components.append({'id':i,'name':p.name,'faces':len(p.data.polygons),'bounds':[list(lo),list(hi)],'center':list((lo+hi)/2),'size':list(hi-lo)})
        p.hide_render = True
        p.hide_set(True)
    (OUT/'audit.json').write_text(json.dumps({'blender_version':bpy.app.version_string,'source':source,'welded_diagnostic':welded,'images':images,'bounds':bounds,'components':components},indent=2))
    # Render actual texture with neutral studio lights, no geometry cleanup.
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = 800
    sc.render.resolution_y = 650
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    sc.world.color = (.65,.65,.65)
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value = (.7,.7,.7,1)
    bg.inputs['Strength'].default_value = .65
    lo = Vector([b[0] for b in bounds]); hi = Vector([b[1] for b in bounds])
    center=(lo+hi)/2; size=max(hi-lo)
    cam_data=bpy.data.cameras.new('ReviewCam'); cam=bpy.data.objects.new('ReviewCam',cam_data)
    sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=size*1.2
    for name,loc,power in [('Key',(3,-4,5),850),('Fill',(-4,2,3),650)]:
        ld=bpy.data.lights.new(name,'AREA'); light=bpy.data.objects.new(name,ld); sc.collection.objects.link(light)
        light.location=center+Vector(loc)*size*.7; ld.energy=power*size*size; ld.shape='DISK'; ld.size=size*3
        light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    views={'front':(0,-1,.12),'back':(0,1,.12),'right':(1,0,.12),'left':(-1,0,.12),'threequarter':(1,-1,.55),'opposite':(-1,1,.55)}
    paths=[]
    for name, direction in views.items():
        bx_review._look_at(cam,center,Vector(direction).normalized(),size*4)
        sc.render.filepath=str(OUT/f'texture_{name}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    bx_review._tile(paths,2,3,str(OUT/'texture-sheet.png'),list(views))
    # Toolkit creates a separate review scene. Only the source is linked.
    bx_review.review([obj],str(OUT/'geometry'),views=('front','right','threequarter','back'),modes=('silhouette','matcap','wire'),res=480)
    # Isolate largest components to identify whether rider and wheels can be detached.
    obj.hide_render=True
    sc.render.engine='BLENDER_WORKBENCH'
    sc.display.shading.light='STUDIO'; sc.display.shading.color_type='SINGLE'; sc.display.shading.single_color=(.64,.69,.74)
    sc.display.shading.background_type='WORLD'
    sc.world.color=(.92,.92,.92)
    sc.render.resolution_x=sc.render.resolution_y=520
    component_paths=[]
    for p in pieces[:12]:
        p.hide_set(False); p.hide_render=False
        bx_review._look_at(cam,center,Vector((1,-1,.4)).normalized(),size*4)
        sc.render.filepath=str(OUT/f'{p.name}.png')
        bpy.ops.render.render(write_still=True)
        component_paths.append(sc.render.filepath)
        p.hide_set(True); p.hide_render=True
    bx_review._tile(component_paths,3,4,str(OUT/'component-sheet.png'),[p.name for p in pieces[:12]])
    obj.hide_render=False
    sc.render.engine='BLENDER_EEVEE'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'csgt-audit.blend'))
    print('RESULT '+json.dumps({'sheet':str(OUT/'texture-sheet.png'),'components':len(pieces),'audit':str(OUT/'audit.json')}),flush=True)

if __name__=='__main__': main()
