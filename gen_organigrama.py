# -*- coding: utf-8 -*-
"""Genera organigrama-brandooers.excalidraw: roles de la empresa y cómo deben actuar,
con los dos flujos: la validación SUBE y la formación BAJA."""
import json, random, pathlib

def rid(): return ''.join(random.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(12))
def nonce(): return random.randint(1, 2_000_000_000)
els = []

def rect(x, y, w, h, bg, stroke='#1e1e1e', sw=2):
    i = rid()
    els.append({"type":"rectangle","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":sw,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":x,"y":y,"strokeColor":stroke,"backgroundColor":bg,"width":w,"height":h,"seed":nonce(),
      "groupIds":[],"frameId":None,"roundness":{"type":3},"boundElements":[],"updated":1,"link":None,"locked":False})
    return i

def text(x, y, w, h, s, size=16, align='left', color='#1e1e1e', container=None):
    i = rid()
    els.append({"type":"text","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":x,"y":y,"strokeColor":color,"backgroundColor":"transparent","width":w,"height":h,"seed":nonce(),
      "groupIds":[],"frameId":None,"roundness":None,"boundElements":[],"updated":1,"link":None,"locked":False,
      "fontSize":size,"fontFamily":2,"text":s,"textAlign":align,"verticalAlign":"middle","containerId":container,
      "originalText":s,"lineHeight":1.25,"baseline":int(size*0.85)})
    return i

def boxed(x, y, w, h, s, bg, size=12.5, color='#1e1e1e', stroke='#1e1e1e'):
    r = rect(x, y, w, h, bg, stroke=stroke)
    lines = s.count('\n')+1
    th = int(lines*size*1.25)
    t = text(x+16, y+(h-th)//2, w-30, th, s, size=size, align='left', color=color, container=r)
    for e in els:
        if e['id']==r: e['boundElements']=[{"type":"text","id":t}]
    return r

def farrow(ax, ay, bx, by, color='#495057', sw=3, head='arrow'):
    els.append({"type":"arrow","version":1,"versionNonce":nonce(),"isDeleted":False,"id":rid(),
      "fillStyle":"solid","strokeWidth":sw,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":ax,"y":ay,"strokeColor":color,"backgroundColor":"transparent","width":abs(bx-ax),"height":abs(by-ay),
      "seed":nonce(),"groupIds":[],"frameId":None,"roundness":{"type":2},"boundElements":[],"updated":1,"link":None,
      "locked":False,"points":[[0,0],[bx-ax,by-ay]],"lastCommittedPoint":None,
      "startBinding":None,"endBinding":None,"startArrowhead":None,"endArrowhead":head})

BLUE='#a5d8ff'; BS='#1971c2'; PURPLE='#d0bfff'; PS='#7048e8'; GREEN='#b2f2bb'; GS='#2f9e44'; YELLOW='#ffec99'; YS='#e8a90a'

# Título + leyenda
text(120, 34, 1300, 40, "Brandooers · Organigrama — cómo debe actuar cada usuario de la empresa", size=25, align='left')
text(120, 74, 1300, 22, "Color = tipo de función. La validación SUBE, la formación BAJA, la carrera crece de abajo arriba.", size=13.5, align='left', color='#666')
lg=[("gobierno y configuración",BLUE,BS),("calidad y propagación",PURPLE,PS),("validación y coaching",GREEN,GS),("aprende y demuestra",YELLOW,YS)]
lx=120
for lab,c,s in lg:
    rect(lx,106,18,18,c,stroke=s); text(lx+24,108,190,18,lab,size=11.5,align='left',color=s); lx+=210

# Boxes centrales (jerarquía)
BX, BW, BH = 470, 540, 128
ys = [170, 322, 474, 626, 778, 930]
roles = [
 ("DIRECCIÓN · CEO\n• Fija la estrategia y el presupuesto\n• Aprueba la política de recompensa\n• Ve el ROI: cobertura, riesgo, coste, tiempo", BLUE, BS),
 ("ADMIN · RESPONSABLE DE FORMACIÓN\n• Configura empresa: títulos, certificados, competencias por puesto\n• Monta el motor de reglas de recompensa\n• Designa Inspiradores · fija plan y tope de gasto", BLUE, BS),
 ("INSPIRADOR DE CONOCIMIENTO (Custodio)\n• Monta equipos de empuje a la adopción\n• Decide qué casos reales entran como material\n• Audita la cadena de validaciones (calidad)", PURPLE, PS),
 ("TEAM LEADER · RESPONSABLE DE EQUIPO\n• Pide y prioriza formación según necesidad\n• Valida los casos prácticos de su equipo\n• Ve cobertura y riesgo de SU equipo · coachea", GREEN, GS),
 ("COACH · REFERENTE · COACH DE COACHES\n• Forma y valida a otros en su competencia\n• Coach de coaches: forma a los formadores\n• Solo coachea donde es referente de verdad", GREEN, GS),
 ("EMPLEADO · ALUMNO\n• Onboarding: por qué / para qué · su sector y puesto\n• Aprende con su ruta y DEMUESTRA en un caso real\n• Aporta casos reales · cuando domina → forma al siguiente", YELLOW, YS),
]
for (s, bg, st), y in zip(roles, ys):
    boxed(BX, y, BW, BH, s, bg, stroke=st)
# flechas de autoridad (línea fina discontinua entre cajas)
cx = BX+BW//2
for i in range(len(ys)-1):
    farrow(cx, ys[i]+BH, cx, ys[i+1], color='#adb5bd', sw=2, head=None)

# Flujo IZQUIERDA: la validación SUBE
lax = BX-90
farrow(lax, ys[-1]+BH-10, lax, ys[0]+20, color=GS, sw=4)
rect(120, 470, 300, 150, '#ebfbee', stroke=GS)
text(136, 486, 268, 22, "LA VALIDACIÓN SUBE ↑", size=15, align='left', color=GS)
text(136, 516, 268, 100, "El empleado DEMUESTRA en un caso real →\nel coach / team leader lo VALIDA →\nel Inspirador AUDITA la calidad.\n\nNadie se autocertifica: se sube por\nevidencia, no por completar cursos.", size=12.5, align='left')

# Flujo DERECHA: la formación BAJA
rax = BX+BW+90
farrow(rax, ys[0]+20, rax, ys[-1]+BH-10, color=PS, sw=4)
rect(BX+BW+120, 470, 300, 150, '#f8f0fc', stroke=PS)
text(BX+BW+136, 486, 268, 22, "LA FORMACIÓN BAJA ↓", size=15, align='left', color=PS)
text(BX+BW+136, 516, 268, 100, "El que domina FORMA al siguiente.\nEl coach de coaches forma a los coaches.\nEl conocimiento se multiplica y se queda\ndentro — no depende de una persona.", size=12.5, align='left')

# Nota carrera (bucle abajo)
rect(120, 800, 300, 210, '#fff9db', stroke=YS)
text(136, 816, 268, 22, "LA CARRERA CRECE ↗", size=15, align='left', color=YS)
text(136, 846, 268, 150, "El empleado que domina una competencia\nse convierte en coach, y de ahí en\ncoach de coaches e Inspirador.\n\nEs una escalera de progreso real que\nNO consume puestos de estructura:\nsube estatus, atribuciones y carrera\nsin quitarle la silla a nadie.", size=12.5, align='left')

# Nota config + ROI (derecha abajo)
rect(BX+BW+120, 700, 300, 150, '#e7f5ff', stroke=BS)
text(BX+BW+136, 716, 268, 22, "GOBIERNO", size=15, align='left', color=BS)
text(BX+BW+136, 746, 268, 100, "Dirección + Admin CONFIGURAN las reglas:\ntítulos, certificados, competencias por\npuesto y recompensas — personalizable\npor empresa. El panel devuelve el ROI a\nDirección y a cada responsable.", size=12.5, align='left')

# Copiloto dos caras (abajo derecha)
rect(BX+BW+120, 870, 300, 140, '#f1f3f5', stroke='#868e96')
text(BX+BW+136, 886, 268, 22, "COPILOTO DE DOS CARAS", size=15, align='left', color='#495057')
text(BX+BW+136, 916, 268, 90, "Al directivo le muestra dónde está\nexpuesto y a quién ascender por datos.\nAl empleado le guía su ruta y su\nprogreso. Misma herramienta, dos usos.", size=12.5, align='left')

out = {"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":els,
  "appState":{"gridSize":None,"viewBackgroundColor":"#fbfbfd"},"files":{}}
pathlib.Path(r"C:\Users\march\formacion-coach-ide\organigrama-brandooers.excalidraw").write_text(json.dumps(out), encoding="utf-8")
print("OK organigrama-brandooers.excalidraw", len(els), "elementos")
