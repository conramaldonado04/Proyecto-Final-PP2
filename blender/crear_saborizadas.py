"""Naranja y Pomelo 1,5 L, reconstrucción basada en fotos del usuario.

Ejecutar con Blender --python o con Python para exportar los GLB.
Las fotografías se conservan intactas: la proyección se realiza con UV.
Las medidas son estimadas; los sectores laterales no fotografiados llevan
el color de soporte, sin inventar textos, códigos ni datos nutricionales.
"""
from pathlib import Path
import sys
import math
import json
sys.path.insert(0, str(Path(__file__).resolve().parent))
import crear_cola as core

PROFILE = [(-.180,.027),(-.176,.036),(-.169,.041),(-.158,.044),
           (-.140,.0448),(-.110,.045),(-.080,.045),(-.030,.045),
           (.030,.045),(.065,.0445),(.091,.0418),(.110,.037),
           (.130,.027),(.143,.019),(.150,.0148),(.162,.0148)]

def r_at(y):
    return core.radius(y, PROFILE)

def photo_patch(name, material, center, half, top, bottom, rotation=0):
    vertices, uv, faces = [], [], []
    cols, rows = 64, 8
    for j in range(rows+1):
        t=j/rows; y=-.100+t*.126
        for i in range(cols+1):
            a=-1.43+2.86*i/cols
            theta=a+rotation
            r=r_at(y)+.00055
            vertices.append((r*math.sin(theta),y,r*math.cos(theta)))
            cx=center[0]+(center[1]-center[0])*t if isinstance(center,tuple) else center
            rx=half[0]+(half[1]-half[0])*t if isinstance(half,tuple) else half
            x=cx+rx*math.sin(a)
            yt=top[0]+top[1]*math.cos(a)+top[2]*math.sin(a)
            yb=bottom[0]+bottom[1]*math.cos(a)+bottom[2]*math.sin(a)
            uv.append((x/1200,(yb+(yt-yb)*t)/1600))
    for j in range(rows):
        for i in range(cols):
            a=j*(cols+1)+i; b=a+1; c=a+cols+1; d=c+1
            faces.extend([(a,b,d),(a,d,c)])
    return dict(name=name,positions=vertices,normals=core.normals(vertices,faces),
                uv=uv,triangles=faces,material=material)

def configure(flavor):
    core.OUTPUT=core.ROOT/'models'/('naranpol_'+flavor+'.glb')
    core.REFERENCES=[core.ROOT/'blender/referencias'/(flavor+'-'+side+'.jpg') for side in ('frente','dorso')]
    core.REFERENCE=core.REFERENCES[0]
    core.FILL=.139
    orange=flavor=='naranja'
    def mat(name,color,roughness):
        return dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=color,metallicFactor=0,roughnessFactor=roughness))
    core.MATERIALS=[
        dict(**mat('PET transparente',[.78,.87,.94,.16],.24),alphaMode='BLEND',doubleSided=False),
        mat('Bebida '+flavor,[.88,.39,.008,1] if orange else [.55,.46,.22,.72],.28),
        mat('Tapa azul',[.008,.19,.46,1],.31),
        mat('Laterales sin fotografía',[.88,.19,.018,1] if orange else [.84,.75,.015,1],.7),
        mat('Frente original',[1,1,1,1],.8),mat('Dorso original',[1,1,1,1],.8)]
    if not orange:
        core.MATERIALS[1]['alphaMode']='BLEND'
        core.MATERIALS[1]['doubleSided']=False
    for i in (4,5):core.MATERIALS[i]['pbrMetallicRoughness']['baseColorTexture']={'index':i-4}

def make_meshes(flavor='naranja'):
    configure(flavor)
    # Perfil continuo y hendiduras horizontales: geometría, no textura pintada.
    ys={round(-.180+i*.002,6) for i in range(172)}
    ys.update(y for y,_ in PROFILE)
    grooves=[-.151,-.141,-.131,-.121,-.111,.039,.049,.059,.069,.079,.089,.099,.109,.119]
    # Concentrar muestras sólo donde cambia el relieve y adelgazar el resto.
    ys={y for i,y in enumerate(sorted(ys)) if i%3==0 or any(abs(y-g)<.0025 for g in grooves)}
    ys.update(y for y,_ in PROFILE)
    rings=[]
    for y in sorted(ys):
        depression=sum(.00085*math.exp(-((y-g)/.00155)**2) for g in grooves)
        rings.append((y,r_at(y)-depression))
    meshes=[core.lathe('Bottle',rings,0,feet=True)]
    inner=[(y+.0008*max(0,min(1,(-.15-y)/.03)),r-.00065) for y,r in rings]
    liquid=core.lathe('Liquid',inner,1,feet=True)
    liquid['extras']={'fillHeight':core.FILL,'profile':inner,'maxRadius':.0445,'animatedInViewer':True}
    meshes.append(liquid)
    meshes.append(core.lathe('Cap',[(.157,.0151),(.158,.0161),(.160,.0164),(.176,.0164),(.179,.0158),(.180,.0148)],2,ribbed=True,segments=128))
    meshes.append(core.lathe('TamperRing',[(.153,.0152),(.1535,.016),(.156,.016),(.1565,.0152)],2,segments=64))
    meshes.append(core.lathe('NeckSupport',[(.1478,.015),(.1484,.0182),(.1494,.0182),(.150,.015)],0))
    meshes.append(core.lathe('NeckThread',[(.1508,.0148),(.1515,.0156),(.152,.0148)],0))
    meshes.append(core.lathe('LabelBack',[(-.100,.04535),(.026,.04535)],3,cap=False))
    if flavor=='naranja':
        meshes.append(photo_patch('LabelPhoto',4,579,188,(699,4,5),(1170,65,-3)))
        meshes.append(photo_patch('LabelReverse',5,545,180,(679,0,2),(1141,56,-9),math.pi))
    else:
        meshes.append(photo_patch('LabelPhoto',4,(540,565),(273,307),(527,9,11),(1310,145,-25)))
        meshes.append(photo_patch('LabelReverse',5,595,194,(583,-33,7),(1050,55,-6),math.pi))
    return meshes

def main():
    try: import bpy
    except ImportError: bpy=None
    for flavor in ('naranja','pomelo'):
        meshes=make_meshes(flavor)
        core.OUTPUT.with_suffix('.liquid.json').write_text(json.dumps(meshes[1]['extras']),encoding='utf-8')
        if bpy:
            core.create_blender(meshes,bpy)
            bpy.context.scene['reference_notes']='Fotos propias de '+flavor+' 1,5 L. Forma estimada; laterales no fotografiados.'
        else:core.write_glb(meshes)
        print(flavor, sum(len(m['triangles']) for m in meshes),'triángulos')

if __name__=='__main__':main()
