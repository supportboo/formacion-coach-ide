# -*- coding: utf-8 -*-
"""Genera estrategia-brandooers.excalidraw: el modelo de negocio/producto de Brandooers,
bloque por bloque, coloreado verde=existe / amarillo=parcial / rojo=falta, + adopción y ROI."""
import json, random, pathlib

def rid(): return ''.join(random.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(12))
def nonce(): return random.randint(1, 2_000_000_000)
els = []

def rect(x, y, w, h, bg, stroke='#1e1e1e', rough=1, sw=2):
    i = rid()
    els.append({"type":"rectangle","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":sw,"strokeStyle":"solid","roughness":rough,"opacity":100,"angle":0,
      "x":x,"y":y,"strokeColor":stroke,"backgroundColor":bg,"width":w,"height":h,"seed":nonce(),
      "groupIds":[],"frameId":None,"roundness":{"type":3},"boundElements":[],"updated":1,"link":None,"locked":False})
    return i

def text(x, y, w, h, s, size=16, align='center', color='#1e1e1e', container=None):
    i = rid()
    els.append({"type":"text","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":x,"y":y,"strokeColor":color,"backgroundColor":"transparent","width":w,"height":h,"seed":nonce(),
      "groupIds":[],"frameId":None,"roundness":None,"boundElements":[],"updated":1,"link":None,"locked":False,
      "fontSize":size,"fontFamily":2,"text":s,"textAlign":align,"verticalAlign":"middle","containerId":container,
      "originalText":s,"lineHeight":1.25,"baseline":int(size*0.85)})
    return i

def boxed(x, y, w, h, s, bg, size=13, color='#1e1e1e', stroke='#1e1e1e'):
    r = rect(x, y, w, h, bg, stroke=stroke)
    lines = s.count('\n')+1
    th = int(lines*size*1.25)
    t = text(x+8, y+(h-th)//2, w-16, th, s, size=size, color=color, container=r)
    for e in els:
        if e['id']==r: e['boundElements']=[{"type":"text","id":t}]
    return r

def arrow(a, b, ax, ay, bx, by, color='#495057'):
    els.append({"type":"arrow","version":1,"versionNonce":nonce(),"isDeleted":False,"id":rid(),
      "fillStyle":"solid","strokeWidth":2.5,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":ax,"y":ay,"strokeColor":color,"backgroundColor":"transparent","width":abs(bx-ax),"height":abs(by-ay),
      "seed":nonce(),"groupIds":[],"frameId":None,"roundness":{"type":2},"boundElements":[],"updated":1,"link":None,
      "locked":False,"points":[[0,0],[bx-ax,by-ay]],"lastCommittedPoint":None,
      "startBinding":{"elementId":a,"focus":0,"gap":6},"endBinding":{"elementId":b,"focus":0,"gap":6},
      "startArrowhead":None,"endArrowhead":"arrow"})

GREEN='#b2f2bb'; YELLOW='#ffec99'; GRAY='#e9ecef'; RED='#ffc9c9'; PURPLE='#d0bfff'; BLUE='#a5d8ff'
GS='#2f9e44'; YS='#e8a90a'; RS='#e03131'; BS='#1971c2'

# ---- Título + leyenda ----
text(140, 34, 1600, 40, "Brandooers · Estrategia de producto y negocio — de la adopción al ROI", size=26, align='left')
text(140, 74, 1600, 22, "El conocimiento se queda, se propaga y se mide. Copiloto del directivo y del empleado.", size=14, align='left', color='#666')
rect(140,108,20,20,GREEN); text(166,110,120,20,"ya existe", size=12, align='left', color=GS)
rect(300,108,20,20,YELLOW); text(326,110,200,20,"parcial / especificado", size=12, align='left', color=YS)
rect(540,108,20,20,RED); text(566,110,220,20,"falta por construir", size=12, align='left', color=RS)

# ---- Rejilla de bloques por lane ----
lanes = ["1 · ADOPCIÓN","2 · APRENDIZAJE","3 · VALIDACIÓN","4 · PROPAGACIÓN\n& CARRERA","5 · CONFIG. EMPRESA","6 · PANEL ROI","7 · NEGOCIO & FUNDAE"]
blocks = {
 0:[("HOME + CAPTACIÓN\nbrandooers.com · lead\nacceso temprano",GREEN,GS),
    ("ONBOARDING ENTREVISTA\npor qué · para qué\nsector · puesto",GREEN,GS),
    ("PILOTO 90 DÍAS\n+ línea base\n(garantía)",RED,RS)],
 1:[("RUTA PERSONALIZADA\npor sector y puesto\n(IA)",GREEN,GS),
    ("GENERA CONTENIDO\ncasos reales del puesto\n(crear-curso)",GREEN,GS),
    ("TEST -> BADGE N1\nautocorregido\n(/api/exam)",GREEN,GS)],
 2:[("CASO PRÁCTICO APLICADO\ncon rúbrica visible\nsu trabajo real",RED,RS),
    ("VALIDACIÓN HUMANA\nresponsable/nivel revisa\n(coach parcial)",YELLOW,YS),
    ("GATE COSTE + PROGRESO\nno validas -> practicas\ntope de gasto IA",YELLOW,YS)],
 3:[("NIVELES POR COMPETENCIA\nEn formación · Aplica\nReferente",YELLOW,YS),
    ("COACH -> COACH DE COACHES\nINSPIRADOR · equipos\nde empuje (cascada)",RED,RS),
    ("PUNTOS DE TEMPORADA\npremia enseñar\n+ antifraude",YELLOW,YS)],
 4:[("MOTOR DE REGLAS\ndisparador -> recompensa\n(competencia/cobertura)",RED,RS),
    ("TÍTULOS + CERTIFICADOS\npropios · verificables\ndentro y fuera",RED,RS),
    ("COMPENSACIÓN CONFIG.\nauto / por logros /\na demanda",RED,RS)],
 5:[("COBERTURA\nquién sabe aplicar qué\n(no asistencia)",YELLOW,YS),
    ("RIESGO DE DEPENDENCIA\nalerta: crítica = 1 persona\n(bus factor)",RED,RS),
    ("COSTE FORMAR ↓ · TIEMPO\nA AUTONOMÍA\n(salpicadero dirección)",RED,RS)],
 6:[("COBRO POR PLAN\ngobernado por validación\n(a la empresa)",RED,RS),
    ("GARANTÍA DEL PILOTO\nsi no ves la medición,\nno pagas",RED,RS),
    ("FUNDAE\nvalidación = tutorización\nBoomatik e. organizadora",RED,RS)],
}
W,H = 300,94
x0,y0 = 140,205
dx,dy = 330,116
ids = {}
for c in range(7):
    lx = x0 + c*dx
    text(lx, 158, W, 38, lanes[c], size=14, align='center', color='#343a40')
    for r in range(3):
        title,bg,st = blocks[c][r]
        ids[(c,r)] = (boxed(lx, y0+r*dy, W, H, title, bg, size=12, stroke=st), lx, y0+r*dy)
# flechas de flujo (espina por la fila del medio) adopción -> ROI
for c in range(6):
    a,ax,ay = ids[(c,1)]; b,bx,by = ids[(c+1,1)]
    arrow(a,b, ax+W, ay+H//2, bx, by+H//2, color='#4263eb')

# ---- Paneles inferiores ----
py = 205+3*dy+24
pw = 740; gap = 30
# verde: ya existe
rect(140, py, pw, 300, '#ebfbee', stroke=GS)
text(156, py+14, pw-32, 26, "YA EXISTE (construido en el repo)", size=17, align='left', color=GS)
text(156, py+50, pw-32, 240,
 "• Onboarding + personalización IA (/api/onboard, /api/personalize)\n"
 "• Generación de contenido (crear-curso)\n"
 "• Test de conocimiento + badges (/api/exam)\n"
 "• Coach dashboard + ranking de equipo (/api/coach)\n"
 "• Progreso, mis cursos, tracking (/api/progress, /api/track)\n"
 "• Panel admin: dashboard, insights, cola, equipo, settings\n"
 "• Auth/usuarios, feedback, push, captación de leads\n"
 "• Tope de coste diario de IA (engine settings)", size=13, align='left')
# rojo: falta
rect(140+pw+gap, py, pw, 300, '#fff5f5', stroke=RS)
text(156+pw+gap, py+14, pw-32, 26, "FALTA POR CONSTRUIR (mejoras de desarrollo)", size=17, align='left', color=RS)
text(156+pw+gap, py+50, pw-32, 240,
 "• Validación de caso práctico con rúbrica + doble revisión (nivel 3)\n"
 "• Cascada de roles: coach de coaches, Inspirador, equipos de empuje\n"
 "• Motor de reglas de recompensa por empresa (disparador -> resultado)\n"
 "• Config. de empresa: títulos, certificados verificables, compensación\n"
 "• Panel ROI real: cobertura, riesgo, coste de formar, tiempo a autonomía\n"
 "• Gate de progreso/coste ligado a validación (ampliar el tope actual)\n"
 "• Antifraude de la cascada: topes, multiplicadores, auditoría por muestreo\n"
 "• Línea base del piloto + garantía comercial\n"
 "• FUNDAE: tutorización + control de tiempo/evaluación justificable\n"
 "• Cobro por plan + Boomatik como entidad organizadora", size=13, align='left')
# azul: estrategia adopción -> ROI
rect(140+2*(pw+gap), py, pw, 300, '#e7f5ff', stroke=BS)
text(156+2*(pw+gap), py+14, pw-32, 26, "ESTRATEGIA DE ADOPCIÓN → ROI", size=17, align='left', color=BS)
text(156+2*(pw+gap), py+50, pw-32, 240,
 "1. Entra por un equipo, no por toda la plantilla.\n"
 "2. Onboarding define por qué/para qué -> ruta a su puesto.\n"
 "3. Aprende con lo suyo y DEMUESTRA en un caso real.\n"
 "4. El responsable valida -> mete al mando en el bucle.\n"
 "5. El que domina forma al siguiente -> el saber se queda y se multiplica.\n"
 "6. El panel convierte capacidad en ROI: cobertura, riesgo,\n"
 "    coste de formar, tiempo a autonomía.\n"
 "7. Garantía: si no ves la medición, no pagas.\n"
 "8. FUNDAE baja el coste; Boomatik se usa a sí misma = caso 0.\n\n"
 "Regla de voz: a la web solo salen RESULTADOS, nunca la mecánica.", size=13, align='left')

out = {"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":els,
  "appState":{"gridSize":None,"viewBackgroundColor":"#fbfbfd"},"files":{}}
pathlib.Path(r"C:\Users\march\formacion-coach-ide\estrategia-brandooers.excalidraw").write_text(json.dumps(out), encoding="utf-8")
print("OK estrategia-brandooers.excalidraw", len(els), "elementos")
