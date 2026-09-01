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
text(140, 74, 1600, 22, "Estado real 2026-09-01. Verde = construido con test pasando (Fases 0-7, platform/). El conocimiento se queda, se propaga y se mide.", size=14, align='left', color='#666')
rect(140,108,20,20,GREEN); text(166,110,180,20,"construido + test", size=12, align='left', color=GS)
rect(360,108,20,20,YELLOW); text(386,110,160,20,"parcial", size=12, align='left', color=YS)
rect(540,108,20,20,RED); text(566,110,260,20,"pendiente / diferido", size=12, align='left', color=RS)

# ---- Rejilla de bloques por lane ----
lanes = ["1 · ADOPCIÓN","2 · APRENDIZAJE","3 · VALIDACIÓN","4 · PROPAGACIÓN\n& CARRERA","5 · CONFIG. EMPRESA","6 · PANEL ROI","7 · NEGOCIO & FUNDAE"]
blocks = {
 0:[("HOME + CAPTACIÓN\nbrandooers.com desplegada\npiloto 90 días",GREEN,GS),
    ("ONBOARDING\npor qué · para qué\nsector · puesto (test)",GREEN,GS),
    ("LÍNEA BASE DEL PILOTO\ncaptura del punto\nde partida (pdte)",YELLOW,YS)],
 1:[("RUTA PERSONALIZADA\npor sector y puesto\n(gen parcial)",YELLOW,YS),
    ("CONTENIDO + RAG\nasocia por significado\ningesta/recuperación (test)",GREEN,GS),
    ("TEST -> NIVEL 1\nautocorregido\n(test)",GREEN,GS)],
 2:[("CASO PRÁCTICO + RÚBRICA\nsu trabajo real\n(test)",GREEN,GS),
    ("VALIDACIÓN HUMANA\nresponsable/nivel valida\n(test)",GREEN,GS),
    ("GATE PROGRESO\nno validas -> practicas\ncoste IA: parcial",YELLOW,YS)],
 3:[("NIVELES POR COMPETENCIA\nEn formación·Aplica·Referente\n(test)",GREEN,GS),
    ("CASCADA COACH ->\nCOACH DE COACHES ->\nINSPIRADOR (test)",GREEN,GS),
    ("PUNTOS + ANTIFRAUDE\npaga al aprobar el alumno\n(test)",GREEN,GS)],
 4:[("MOTOR DE REGLAS\ndisparador -> recompensa\n(test)",GREEN,GS),
    ("TÍTULOS + CERTIFICADOS\npropios · verificables\n(test)",GREEN,GS),
    ("COMPENSACIÓN CONFIG.\nno salarial por defecto\n(test)",GREEN,GS)],
 5:[("COBERTURA\nquién aplica qué\n(test)",GREEN,GS),
    ("RIESGO DE DEPENDENCIA\ncrítica = 1 persona\n(test)",GREEN,GS),
    ("COSTE FORMAR / TIEMPO\ntransferencia interna (test)\ntiempo autonomía pdte",YELLOW,YS)],
 6:[("COBRO POR PLAN\ndiferido hasta\nproducto vendible",RED,RS),
    ("GARANTÍA DEL PILOTO\nmensaje en la web\ntracking pdte",YELLOW,YS),
    ("FUNDAE\nacción + control 75%\nexport (test)",GREEN,GS)],
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
# verde: construido y verificado
rect(140, py, pw, 360, '#ebfbee', stroke=GS)
text(156, py+14, pw-32, 26, "CONSTRUIDO Y VERIFICADO · platform/ (Fases 0-7)", size=16, align='left', color=GS)
text(156, py+48, pw-32, 300,
 "• Multi-tenant: Postgres + Drizzle (26 tablas), aislamiento por empresa\n"
 "• Auth + organización (better-auth): 1 usuario a multinacional\n"
 "• RAG: embeddings + ingesta + recuperación por significado\n"
 "• Agentes conversacionales por rol (LLM Anthropic; mock sin clave)\n"
 "• Aprendizaje: onboarding, matrícula, test -> Nivel 1\n"
 "• Validación humana con rúbrica -> Nivel 2 (no autoservicio)\n"
 "• Propagación: coaching, puntos al aprobar, ascenso a Referente, antifraude\n"
 "• Config + motor de reglas + certificados verificables (no salarial)\n"
 "• Panel ROI: cobertura, riesgo de dependencia, transferencia interna\n"
 "• FUNDAE: acción bonificable, control 75%, export justificativo\n"
 "\n"
 "Verificado: typecheck 0 · 8 tests unit · 8 tests integración vs Postgres", size=12.5, align='left')
# rojo/ámbar: pendiente o diferido
rect(140+pw+gap, py, pw, 360, '#fff5f5', stroke=RS)
text(156+pw+gap, py+14, pw-32, 26, "PENDIENTE / DIFERIDO", size=16, align='left', color=RS)
text(156+pw+gap, py+48, pw-32, 300,
 "Config (no código):\n"
 "• Clave Anthropic para respuestas reales de los agentes (ahora mock)\n"
 "• Postgres en el VPS para desplegar (ahora corre en Postgres local)\n"
 "\n"
 "Amarillo (parcial):\n"
 "• Generación IA de la ruta/lecciones enganchada al onboarding\n"
 "• Línea base del piloto + gate de coste de IA por alumno\n"
 "• Tiempo hasta autonomía + tracking de la garantía\n"
 "\n"
 "Diferido:\n"
 "• Cobro por plan / pagos (Fase 8, hasta que el producto se venda)\n"
 "• Doble revisión N3 + auditoría por muestreo de la cascada\n"
 "• Conectar los HTML actuales de SkillUp a la nueva API", size=12.5, align='left')
# azul: estrategia adopción -> ROI
rect(140+2*(pw+gap), py, pw, 360, '#e7f5ff', stroke=BS)
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
