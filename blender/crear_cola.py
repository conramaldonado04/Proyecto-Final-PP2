"""Naranpol Cola: geometría editable, referencia fotográfica y exportación web.

Abrir con ABRIR_COLA_EN_BLENDER.bat o Blender > Scripting > Open > Run Script.
Sin bpy: exporta el mismo conjunto de mallas a GLB, con la biblioteca estándar.
Con bpy: crea una escena nueva, materiales, iluminación, .blend y GLB nativo.
No accede a internet ni modifica escenas anteriores. No genera una etiqueta
trasera ficticia. Medidas estimadas: NO es un escaneo ni una réplica certificada.
"""
from pathlib import Path
import json
import math
import struct

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / 'blender' / 'referencias' / 'cola-fabrica.jpg'
OUTPUT = ROOT / 'models' / 'naranpol_cola.glb'
HEIGHT = 0.360
# Eje Y vertical, metros; origen en el centro de la botella.
PROFILE = [
    (-.180,.036),(-.178,.048),(-.174,.057),(-.166,.062),
    (-.151,.0635),(-.132,.0638),(-.108,.0637),(-.090,.0633),
    (-.060,.0630),(-.025,.0628),(.015,.0628),(.044,.0629),
    (.062,.0624),(.076,.0608),(.090,.0572),(.105,.0512),
    (.120,.0430),(.132,.0345),(.142,.0255),(.149,.0190),
    (.154,.0172),(.160,.0172),(.164,.0172),
]
FILL = .113
SEGMENTS = 64


def radius(y, profile=PROFILE):
    if y <= profile[0][0]: return profile[0][1]
    h=[profile[i+1][0]-profile[i][0] for i in range(len(profile)-1)]
    delta=[(profile[i+1][1]-profile[i][1])/h[i] for i in range(len(h))]
    slopes=[delta[0]]
    for i in range(1,len(profile)-1):
        if delta[i-1]*delta[i]<=0: slopes.append(0.)
        else:
            w1=2*h[i]+h[i-1]; w2=h[i]+2*h[i-1]
            slopes.append((w1+w2)/(w1/delta[i-1]+w2/delta[i]))
    slopes.append(delta[-1])
    for i,((a, ra), (b, rb)) in enumerate(zip(profile, profile[1:])):
        if y <= b:
            t = (y-a)/(b-a)
            # Hermite monótono: continuidad de la pendiente sin escalones.
            return (2*t**3-3*t*t+1)*ra+(t**3-2*t*t+t)*(b-a)*slopes[i]+(-2*t**3+3*t*t)*rb+(t**3-t*t)*(b-a)*slopes[i+1]
    return profile[-1][1]


def normals(positions, triangles):
    ns = [[0., 0., 0.] for _ in positions]
    for a,b,c in triangles:
        u = [positions[b][i]-positions[a][i] for i in range(3)]
        v = [positions[c][i]-positions[a][i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for j in (a,b,c):
            for i in range(3): ns[j][i] += n[i]
    return [tuple(v/math.sqrt(sum(t*t for t in n)) for v in n)
            if sum(t*t for t in n)>1e-24 else (0.,1.,0.) for n in ns]


def lathe(name, rings, material, feet=False, ribbed=False, cap=True, segments=SEGMENTS, open_top=False):
    vertices, faces, uv = [], [], []
    for j,(y,r) in enumerate(rings):
        for i in range(segments+1):
            angle = 2*math.pi*i/segments
            rr, yy = r,y
            if feet:
                weight = max(0., min(1.,(-.135-y)/.044))
                valley = (.5+.5*math.cos(5*angle))**2
                rr *= 1-.19*weight*valley
                yy += .010*weight**3*valley
            if ribbed:
                rr += .00036*(.5+.5*math.cos(32*angle))
            vertices.append((rr*math.sin(angle), yy, rr*math.cos(angle)))
            uv.append((i/segments,j/max(1,len(rings)-1)))
    stride = segments+1
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*stride+i; b=a+1; c=a+stride; d=c+1
            faces.extend([(a,b,d),(a,d,c)])
    if cap:
        for row, top in ((0,False),(len(rings)-1,True)):
            if top and open_top: continue
            center=len(vertices); vertices.append((0.,rings[row][0]+(.014 if feet and not top else 0.),0.)); uv.append((.5,.5))
            for i in range(segments):
                a=row*stride+i; b=a+1
                faces.append((center,a,b) if top else (center,b,a))
    ns=normals(vertices,faces)
    # Soldar sólo normales de la costura UV: evita una línea oscura vertical.
    for j in range(len(rings)):
        a=j*stride; b=a+segments
        n=tuple(ns[a][i]+ns[b][i] for i in range(3)); l=math.sqrt(sum(x*x for x in n))
        ns[a]=ns[b]=tuple(x/l for x in n)
    return dict(name=name,positions=vertices,normals=ns,uv=uv,triangles=faces,material=material)


def make_meshes():
    meshes=[]
    rings=[]
    for (y,_),(end,_) in zip(PROFILE,PROFILE[1:]):
        for s in range(2):
            yy=y+(end-y)*s/2; r=radius(yy)
            if -.132 < yy < -.107:
                r-=.00055*math.exp(-((yy+.119)/.003)**2)
            rings.append((yy,r))
    rings.append(PROFILE[-1])
    # Envolvente única: transparencia simple para web, sin doble pared refractiva.
    meshes.append(lathe('Bottle',rings,0,feet=True))
    inner=[(y+.001*max(0.,min(1.,(-.15-y)/.03)),max(.003,r-.0012)) for y,r in rings]
    liquid=lathe('Liquid',inner,1,feet=True)
    liquid['extras']={'fillHeight':FILL,'profile':inner,'maxRadius':.0626,
                      'animatedInViewer':True,'note':'Web: volumen recortado y superficie separada.'}
    meshes.append(liquid)
    caprings=[(.156,.0176),(.157,.0185),(.159,.0187),(.1778,.0187),(.1794,.0182),(.180,.0168)]
    meshes.append(lathe('Cap',caprings,2,ribbed=True,segments=128))
    meshes.append(lathe('TamperRing',[(.1518,.0178),(.1523,.0184),(.1547,.0184),(.1555,.0178)],2,ribbed=True,segments=128))
    meshes.append(lathe('NeckSupport',[(.1476,.018),(.1480,.0221),(.149,.0221),(.1497,.018)],0))
    meshes.append(lathe('LabelBack',[(y,radius(y)+.00038) for y in [-.095,-.070,-.04,-.02,-.003]],3))
    # Foto completa sin modificar; UV proyectadas sobre el arco visible del envase.
    # El logotipo de la foto está a la derecha del eje óptico: se centra al modelar.
    vertices,faces,uv=[],[],[]
    cols=48; rows=4; angle_center=.29
    for j in range(rows+1):
        t=j/rows; y=-.095+t*.092
        for i in range(cols+1):
            photo_angle=-1.19+2.38*i/cols
            a=photo_angle-angle_center
            r=radius(y)+.00052
            vertices.append((r*math.sin(a),y,r*math.cos(a)))
            x=594+59*math.sin(photo_angle)
            top=277+8*math.cos(photo_angle)+4*math.sin(photo_angle)
            bottom=343+18*math.cos(photo_angle)+math.sin(photo_angle)
            pixel_y=bottom+(top-bottom)*t
            uv.append((x/800,pixel_y/450))
    for j in range(rows):
        for i in range(cols):
            a=j*(cols+1)+i; b=a+1; c=a+cols+1; d=c+1
            faces.extend([(a,b,d),(a,d,c)])
    meshes.append(dict(name='LabelPhoto',positions=vertices,triangles=faces,
                       normals=normals(vertices,faces),uv=uv,material=4))
    return meshes


MATERIALS=[
    dict(name='PET liviano',alphaMode='BLEND',doubleSided=False,
         pbrMetallicRoughness=dict(baseColorFactor=[.82,.9,1,.09],metallicFactor=0,roughnessFactor=.35)),
    dict(name='Cola',pbrMetallicRoughness=dict(baseColorFactor=[.006,.0018,.0005,1],metallicFactor=0,roughnessFactor=.19),
         ),
    dict(name='Tapa azul',pbrMetallicRoughness=dict(baseColorFactor=[.018,.07,.48,1],metallicFactor=0,roughnessFactor=.32)),
    dict(name='Dorso pendiente - color de soporte',pbrMetallicRoughness=dict(baseColorFactor=[.63,.012,.011,1],metallicFactor=0,roughnessFactor=.48)),
    dict(name='Etiqueta - fotografia aportada',pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],baseColorTexture={'index':0},metallicFactor=0,roughnessFactor=.5)),
]


def make_preview_liquid(profile, fill_height):
    """Volumen cerrado desde el fondo al nivel real, sin un operador de corte.

    Se usa exclusivamente para la vista fija de Blender. El GLB conserva el
    volumen completo porque el visor web lo recorta en tiempo real.
    """
    rings=[(y,r) for y,r in profile if y < fill_height-1e-10]
    for (y0,r0),(y1,r1) in zip(profile,profile[1:]):
        if y0 <= fill_height <= y1:
            r=r0+(r1-r0)*(fill_height-y0)/(y1-y0)
            rings.append((fill_height,r));break
    else: raise ValueError('El nivel de llenado debe estar dentro del perfil.')
    if len(rings)<3: raise ValueError('Volumen de bebida insuficiente.')
    result=lathe('LiquidFilled',rings,1,feet=True)
    assert min(p[1] for p in result['positions']) < fill_height-.15
    assert abs(max(p[1] for p in result['positions'])-fill_height)<1e-9
    return result


def write_glb(meshes):
    """Exportador glTF determinista usado para revisar mallas sin Blender local."""
    binary=bytearray(); views=[]; accessors=[]
    def buffer_view(data,target=None):
        while len(binary)%4: binary.append(0)
        view={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
        if target: view['target']=target
        views.append(view); binary.extend(data); return len(views)-1
    def accessor(data,width,integer=False):
        flat=[v for row in data for v in row] if width>1 else data
        fmt='I' if integer else 'f'
        packed=struct.pack('<'+fmt*len(flat),*flat)
        a={'bufferView':buffer_view(packed,34963 if integer else 34962),
           'componentType':5125 if integer else 5126,'count':len(data),
           'type':{1:'SCALAR',2:'VEC2',3:'VEC3'}[width]}
        if width==3 and not integer:
            a['min']=[min(row[i] for row in data) for i in range(3)]
            a['max']=[max(row[i] for row in data) for i in range(3)]
        accessors.append(a); return len(accessors)-1
    glmeshes=[]; nodes=[]
    for mesh in meshes:
        primitive={'attributes':{'POSITION':accessor(mesh['positions'],3),
                                  'NORMAL':accessor(mesh['normals'],3),
                                  'TEXCOORD_0':accessor(mesh['uv'],2)},
                   'indices':accessor([v for tri in mesh['triangles'] for v in tri],1,True),
                   'material':mesh['material']}
        glmeshes.append({'name':mesh['name'],'primitives':[primitive]})
        node={'name':mesh['name'],'mesh':len(glmeshes)-1,'extras':{'naranpolRole':mesh['name'],**mesh.get('extras',{})}}
        nodes.append(node)
    image_views=[buffer_view(ref.read_bytes()) for ref in globals().get("REFERENCES",[REFERENCE])]
    doc={'asset':{'version':'2.0','generator':'Naranpol geometry source / crear_cola.py (standalone export)'},
         'scene':0,'scenes':[{'nodes':list(range(len(nodes))),'extras':{'status':'revision','reference':'Fotografías aportadas; medidas estimadas'}}],
         'nodes':nodes,'meshes':glmeshes,'materials':MATERIALS,'accessors':accessors,'bufferViews':views,
         'buffers':[{'byteLength':len(binary)}],'images':[{'bufferView':v,'mimeType':'image/jpeg'} for v in image_views],
         'textures':[{'source':i,'sampler':0} for i in range(len(image_views))],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
         }
    data=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    data+=b' '*((-len(data))%4); binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(data)+8+len(binary))
    result+=struct.pack('<II',len(data),0x4E4F534A)+data+struct.pack('<II',len(binary),0x004E4942)+binary
    OUTPUT.parent.mkdir(parents=True,exist_ok=True); OUTPUT.write_bytes(result)
    print('GLB:',OUTPUT)


def create_blender(meshes,bpy):
    from mathutils import Vector
    # Nueva escena: no borrar objetos ni datos del trabajo que esté abierto.
    scene=bpy.data.scenes.new(OUTPUT.stem+' - optimizada')
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    materials=[]
    photos=[bpy.data.images.load(str(ref),check_existing=True) for ref in globals().get('REFERENCES',[REFERENCE])]
    for photo in photos: photo.pack()
    for data in MATERIALS:
        mat=bpy.data.materials.new(data['name']); mat.use_nodes=True
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        pbr=data['pbrMetallicRoughness']
        bsdf.inputs['Base Color'].default_value=pbr['baseColorFactor']
        mat.diffuse_color=pbr['baseColorFactor']
        bsdf.inputs['Roughness'].default_value=pbr['roughnessFactor']
        bsdf.inputs['Alpha'].default_value=pbr['baseColorFactor'][3]
        if pbr['baseColorFactor'][3]<1:
            if hasattr(mat,'surface_render_method'):mat.surface_render_method='DITHERED'
            elif hasattr(mat,'blend_method'):mat.blend_method='BLEND'
            if hasattr(mat,'use_transparency_overlap'):mat.use_transparency_overlap=False
            mat.use_backface_culling=True
        ex=data.get('extensions',{})
        for key,value in [('Transmission Weight',ex.get('KHR_materials_transmission',{}).get('transmissionFactor',0)),
                          ('IOR',ex.get('KHR_materials_ior',{}).get('ior',1.5)),
                          ('Coat Weight',ex.get('KHR_materials_clearcoat',{}).get('clearcoatFactor',0))]:
            if key in bsdf.inputs: bsdf.inputs[key].default_value=value
        if 'baseColorTexture' in pbr:
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=photos[pbr['baseColorTexture']['index']]
            mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        materials.append(mat)
    models=[]
    for src in meshes:
        mesh=bpy.data.meshes.new(src['name'])
        mesh.from_pydata([(x,-z,y) for x,y,z in src['positions']],[],src['triangles']); mesh.update()
        obj=bpy.data.objects.new(src['name'],mesh); scene.collection.objects.link(obj)
        obj['naranpolRole']=src['name']
        obj.data.materials.append(materials[src['material']])
        for face in mesh.polygons: face.use_smooth=True
        if hasattr(mesh,'normals_split_custom_set_from_vertices'):
            mesh.normals_split_custom_set_from_vertices([(x,-z,y) for x,y,z in src['normals']])
        uv=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            u,v=src['uv'][loop.vertex_index]; uv.data[loop.index].uv=(u,1-v)
        if 'extras' in src:
            # JSON companion is read by the web viewer for Blender exports too.
            obj['fillHeight']=FILL; obj['maxRadius']=.0626
        obj.select_set(True); models.append(obj)
    scene['reference_notes']='Reconstrucción basada en fotografías aportadas. Forma y medidas estimadas; sectores no fotografiados sin reconstruir.'
    # Exportar sólo la botella, nunca cámara, suelo o luces.
    bpy.context.view_layer.objects.active=models[0]
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,export_extras=True)
    # Vista de Blender: construir la bebida ya llena, con su superficie cerrada.
    # Evita eliminar la mitad equivocada o depender del resultado de un bisect.
    liquid=next(o for o in models if o.get('naranpolRole')=='Liquid')
    source=next(m for m in meshes if m['name']=='Liquid')
    filled=make_preview_liquid(source['extras']['profile'],source['extras']['fillHeight'])
    preview=bpy.data.meshes.new('Cola llena - superficie cerrada')
    preview.from_pydata([(x,-z,y) for x,y,z in filled['positions']],[],filled['triangles'])
    preview.update();preview.materials.append(materials[1]);liquid.data=preview
    for face in preview.polygons: face.use_smooth=abs(face.normal.z)<.95
    if hasattr(preview,'normals_split_custom_set_from_vertices'):
        preview.normals_split_custom_set_from_vertices([(x,-z,y) for x,y,z in filled['normals']])
    liquid.hide_viewport=False;liquid.hide_render=False
    liquid['preview_filled']=True
    def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Camara producto'); camera=bpy.data.objects.new('Camara producto',camera_data)
    scene.collection.objects.link(camera); camera.location=(.018,-.88,.065); aim(camera,(0,0,0)); camera_data.lens=65; scene.camera=camera
    for name,location,power,size in [('Softbox izquierda',(-.28,-.35,.38),3,.12),('Softbox derecha',(.3,-.12,.18),1.2,.08),('Luz posterior',(-.12,.26,.32),2.5,.10)]:
        light_data=bpy.data.lights.new(name,'AREA'); light_data.energy=power; light_data.shape='RECTANGLE'; light_data.size=size; light_data.size_y=.50
        light=bpy.data.objects.new(name,light_data); scene.collection.objects.link(light); light.location=location; aim(light,(0,0,0))
    scene.world=bpy.data.worlds.new('Estudio claro'); scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.08
    # Motor de tiempo real para el render manual; apertura siempre en Sólido.
    try: scene.render.engine='BLENDER_EEVEE_NEXT'
    except TypeError:
        try: scene.render.engine='BLENDER_EEVEE'
        except TypeError: scene.render.engine='BLENDER_WORKBENCH'
    if hasattr(scene,'eevee') and hasattr(scene.eevee,'taa_render_samples'):
        scene.eevee.taa_render_samples=16
    if hasattr(scene,'eevee') and hasattr(scene.eevee,'use_raytracing'):
        scene.eevee.use_raytracing=False
    scene.render.resolution_x=600; scene.render.resolution_y=750; scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    try: scene.view_settings.view_transform='AgX'
    except TypeError: pass
    for obj in scene.objects: obj.select_set(False)
    for obj in models: obj.select_set(True)
    bpy.context.view_layer.objects.active=models[0]
    # Vista de trabajo sin trazado de rayos; no evalúa el aspecto fotográfico.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active; space.shading.type='SOLID'; space.overlay.show_overlays=False
                space.shading.color_type='SINGLE'
                # Usar el estudio de la escena, no el HDRI de árboles de Material Preview.
                for setting in ('use_scene_world','use_scene_lights','use_scene_world_render','use_scene_lights_render'):
                    if hasattr(space.shading,setting):setattr(space.shading,setting,True)
                space.region_3d.view_distance=.60; space.region_3d.view_location=(0,0,0)
                space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
    scene.render.filepath=str(ROOT/'models'/'blender'/'cola-render.png')
    blend=ROOT/'models'/'blender'/(OUTPUT.stem+'.blend'); blend.parent.mkdir(exist_ok=True)
    # No sobreescribir una edición previa del usuario al ejecutar de nuevo.
    if blend.exists():
        from datetime import datetime
        blend=blend.with_name(OUTPUT.stem+'_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print('BLENDER:',blend)


def main():
    if not REFERENCE.exists(): raise FileNotFoundError('Falta la foto. Extraé todo el ZIP antes de abrir Blender: '+str(REFERENCE))
    meshes=make_meshes()
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    (OUTPUT.parent/'naranpol_cola.liquid.json').write_text(json.dumps(meshes[1]['extras'],separators=(',',':')),encoding='utf-8')
    try: import bpy
    except ImportError: write_glb(meshes)
    else: create_blender(meshes,bpy)


if __name__=='__main__': main()
