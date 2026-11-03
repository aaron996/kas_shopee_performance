"""Create a motorcycle-only derivative; preserve original Meshy file."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parent/'traffic-police-v1'
OUT=ROOT/'motorcycle'
sys.path.insert(0,str(__import__('pathlib').Path.home() / '.codex/skills/scenario-blender-expert/scripts'))
import bx_review

def material(name,color,metal=0,rough=.72):
    m=bpy.data.materials.new(name)
    m.diffuse_color=color
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=color
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Alpha'].default_value=color[3]
    if color[3]<1:m.surface_render_method='DITHERED'
    return m

def assign(o,m):
    o.data.materials.clear();o.data.materials.append(m)
    for f in o.data.polygons:f.material_index=0

def cylinder(name,a,b,r,mat):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();assign(o,mat)
    return o

def block(name,loc,size,mat,bevel=.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    assign(o,mat)
    if bevel:
        mod=o.modifiers.new('restrained_bevel','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def join(objs,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join();o=bpy.context.object;o.name=name;return o

def cushion(name,outline,top,bottom,mat):
    vertices=[(x,y,z) for z in [bottom,top] for x,y in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);assign(o,mat)
    return o

def tyre(name,center,radius,mat):
    # Rebuild circular rubber to remove source wobble and texture contamination.
    n,m=32,8;vertices=[];faces=[]
    for i in range(n):
        theta=2*math.pi*i/n
        for j in range(m):
            phi=2*math.pi*j/m
            radial=radius-.018+.018*math.cos(phi)
            vertices.append((center[0]+radial*math.cos(theta),.032*math.sin(phi),center[2]+radial*math.sin(theta)))
    for i in range(n):
        for j in range(m):faces.append((i*m+j,i*m+(j+1)%m,((i+1)%n)*m+(j+1)%m,((i+1)%n)*m+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);assign(o,mat)
    for f in mesh.polygons:f.use_smooth=True
    return o

def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'review/csgt-audit.blend'))
    sc=bpy.context.scene
    pieces={int(o.name.split('_')[1]):o for o in list(sc.objects) if o.name.startswith('Part_')}
    # Identified in the complete 91-component atlas; includes helmet clips and radio.
    officer_ids={0,6,18,21,49,53,78,81,88,89}
    rebuild_ids={7,20,29,34,67,74}
    delete=[o for o in list(sc.objects) if o.name=='CSGT_Source' or (o.name.startswith('Part_') and int(o.name.split('_')[1]) in officer_ids|rebuild_ids)]
    bpy.data.batch_remove(delete)
    pieces={i:o for i,o in pieces.items() if i not in officer_ids|rebuild_ids}
    for o in pieces.values():o.hide_render=False;o.hide_set(False)
    black=material('CSGT_Rubber',(.018,.022,.028,1))
    seat=material('CSGT_Saddle',(.035,.040,.045,1))
    silver=material('CSGT_Metal',(.32,.36,.4,1),metal=.25)
    white=material('CSGT_BodyWhite',(.82,.85,.88,1))
    blue=material('CSGT_BlueBeacon',(.015,.10,.75,1),rough=.35)
    red=material('CSGT_RedBeacon',(.75,.015,.025,1),rough=.35)
    amber=material('CSGT_Reflector',(.95,.36,.018,1))
    glass=material('CSGT_Windscreen',(.30,.55,.72,.26),rough=.2)
    wheel_groups=json.loads((SOURCE/'review/wheel-groups.json').read_text())
    for i,name in [(2,'rear'),(3,'front')]:
        old=pieces[i];bpy.data.objects.remove(old,do_unlink=True)
        c=next(g['center'] for g in wheel_groups if g['name']==name)
        pieces[i]=tyre(f'RebuiltTyre_{name}',c,c[2]+.359366,black)
    for i in [9,10,14,15,19,32,38]:assign(pieces[i],seat)
    assign(pieces[12],glass)
    assign(pieces[16],blue);assign(pieces[17],red)
    repairs=[]
    for sign in [-1,1]:
        y=sign*.047
        repairs.append(cylinder(f'Fork_{sign}',(-.29,y,-.005),(-.3766,y,-.232),.010,silver))
        repairs.append(cylinder(f'ForkSleeve_{sign}',(-.342,y,-.135),(-.3766,y,-.232),.014,black))
        repairs.append(block(f'ForkReflector_{sign}',(-.35,y*1.25,-.155),(.012,.008,.045),amber,.002))
        repairs.append(cylinder(f'Handlebar_{sign}',(-.216,0,.069),(-.155,sign*.125,.075),.006,black))
        repairs.append(cylinder(f'Grip_{sign}',(-.155,sign*.105,.075),(-.155,sign*.15,.075),.010,seat))
        repairs.append(cylinder(f'MirrorBase_{sign}',(-.155,sign*.12,.075),(-.16,sign*.135,.12),.004,black))
    repairs.append(cylinder('SteeringStem',(-.268,0,-.035),(-.216,0,.069),.015,black))
    repairs.append(cylinder('FrontAxle',(-.3766,-.056,-.232),(-.3766,.056,-.232),.012,silver))
    outline=[(-.11,-.035),(-.065,-.060),(.12,-.064),(.18,-.045),(.18,.045),(.12,.064),(-.065,.060),(-.11,.035)]
    repairs.append(cushion('RebuiltFrontSaddle',outline,.006,-.021,seat))
    repairs.append(cushion('RebuiltUnderSaddle',outline,-.025,-.08,black))
    # Faceted tank cover replaces the ragged rider-occluded tank surface.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=(-.163,0,-.012))
    tank=bpy.context.object;tank.name='RebuiltTank';tank.scale=(.115,.067,.061);assign(tank,white);repairs.append(tank)
    wheel_ids={int(n.split('_')[1]) for g in wheel_groups for n in g['parts']}
    for i in wheel_ids-{2,3}:assign(pieces[i],silver)
    body=join([o for i,o in pieces.items() if i not in wheel_ids]+repairs,'csgt-motorcycle-body')
    final=[body]
    # Normalize to glTF +X forward, Y up on export, 2.5 units long, grounded.
    scale=2.5;ground=-.359366
    transform=Matrix((( -scale,0,0,0),(0,-scale,0,0),(0,0,scale,-ground*scale),(0,0,0,1)))
    body.data.transform(transform);body.matrix_world=Matrix.Identity(4)
    pivots={}
    for g in wheel_groups:
        group=[pieces[int(n.split('_')[1])] for n in g['parts']]
        wheel=join(group,'csgt-motorcycle-wheel-'+g['name'])
        wheel.data.transform(transform);wheel.matrix_world=Matrix.Identity(4)
        center=transform@Vector(g['center'])
        wheel.data.transform(Matrix.Translation(-center));wheel.location=center
        final.append(wheel);pivots[g['name']]=list(center)
    # Source lights were scaled for source dimensions; recreate neutral review lighting.
    for o in list(sc.objects):
        if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
    for name,loc,power in [('Key',(4,-5,7),450),('Fill',(-3,4,5),320)]:
        ld=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,ld);sc.collection.objects.link(o);o.location=loc;ld.energy=power;ld.size=5
        o.rotation_euler=(Vector((0,0,.8))-o.location).to_track_quat('-Z','Y').to_euler()
    sc.world.use_nodes=True
    bg=next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.65,.65,.65,1);bg.inputs['Strength'].default_value=.45
    sc.render.engine='BLENDER_EEVEE';sc.view_settings.view_transform='Standard'
    sc.render.resolution_x=900;sc.render.resolution_y=650;sc.render.resolution_percentage=100
    cam=sc.camera;cam.data.type='ORTHO';cam.data.ortho_scale=3.0
    paths=[]
    for name,d in {'front':(1,0,.15),'back':(-1,0,.15),'side_a':(0,-1,.2),'side_b':(0,1,.2),'front_3q':(1,-1,.7),'top':(.1,-.1,1)}.items():
        bx_review._look_at(cam,Vector((0,0,.75)),Vector(d).normalized(),8)
        sc.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);paths.append(sc.render.filepath)
    bx_review._tile(paths,2,3,str(OUT/'motorcycle-review.png'),['front','back','side A','side B','front 3q','top'])
    bpy.ops.object.select_all(action='DESELECT')
    for o in final:o.select_set(True)
    bpy.context.view_layer.objects.active=body
    # Triangulate derivative explicitly for stable engine output.
    for o in final:
        mod=o.modifiers.new('ExportTriangles','TRIANGULATE');bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'csgt-motorcycle-prepared-v1.glb'),export_format='GLB',use_selection=True,export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'csgt-motorcycle-prepared-v1.blend'))
    stats={'removed_officer_component_ids':sorted(officer_ids),'replaced_component_ids':sorted(rebuild_ids),'rebuilt_tyres':True,'source_diagnostic_weld':True,'objects':[{'name':o.name,'triangles':len(o.data.polygons),'materials':len(o.data.materials)} for o in final],'pivot_blender_zup':pivots,'wheel_spin_axis_blender':'Y','wheel_spin_axis_gltf':'Z','length_units':2.5,'status':'local prepared derivative pending render review; no runtime integration'}
    (OUT/'preparation.json').write_text(json.dumps(stats,indent=2));print('RESULT '+json.dumps(stats),flush=True)

if __name__=='__main__':main()
