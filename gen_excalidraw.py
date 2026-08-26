# -*- coding: utf-8 -*-
"""Genera pipeline.excalidraw: la escalera de agentes de Brandooers como diagrama."""
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
    lines = s.count('\n')+1
    els.append({"type":"text","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":x,"y":y,"strokeColor":color,"backgroundColor":"transparent","width":w,"height":h,"seed":nonce(),
      "groupIds":[],"frameId":None,"roundness":None,"boundElements":[],"updated":1,"link":None,"locked":False,
      "fontSize":size,"fontFamily":2,"text":s,"textAlign":align,"verticalAlign":"middle","containerId":container,
      "originalText":s,"lineHeight":1.25,"baseline":int(size*0.85)})
    return i

def boxed(x, y, w, h, s, bg, size=15, color='#1e1e1e'):
    r = rect(x, y, w, h, bg)
    lines = s.count('\n')+1
    th = int(lines*size*1.25)
    t = text(x+8, y+(h-th)//2, w-16, th, s, size=size, color=color, container=r)
    # enlazar contenedor <-> texto
    for e in els:
        if e['id']==r: e['boundElements']=[{"type":"text","id":t}]
    return r

def arrow(a, b, ax, ay, bx, by):
    i = rid()
    els.append({"type":"arrow","version":1,"versionNonce":nonce(),"isDeleted":False,"id":i,
      "fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"angle":0,
      "x":ax,"y":ay,"strokeColor":"#495057","backgroundColor":"transparent","width":abs(bx-ax),"height":abs(by-ay),
      "seed":nonce(),"groupIds":[],"frameId":None,"roundness":{"type":2},"boundElements":[],"updated":1,"link":None,
      "locked":False,"points":[[0,0],[bx-ax,by-ay]],"lastCommittedPoint":None,
      "startBinding":{"elementId":a,"focus":0,"gap":6},"endBinding":{"elementId":b,"focus":0,"gap":6},
      "startArrowhead":None,"endArrowhead":"arrow"})

GREEN='#b2f2bb'; YELLOW='#ffec99'; GRAY='#e9ecef'; RED='#ffc9c9'; PURPLE='#d0bfff'; BLUE='#a5d8ff'
# título
text(120, 40, 700, 40, "Brandooers · Pipeline de agentes — de un tema a un curso examinado", size=24, align='left')
text(120, 76, 700, 24, "verde = construido/listo   ·   amarillo = especificado (reusa tus agentes)   ·   gris = pendiente", size=13, align='left', color='#666')

rungs = [
 ("1 · Estratega de temas","decide QUÉ crear (por demanda real)", GRAY),
 ("2 · Investigador técnico","research Tier-1 · cada dato con fuente", YELLOW),
 ("3 · Verificador de fuentes","fact-check independiente · enlaces 200", YELLOW),
 ("4 · Constructor de curso","monta el playbook SOLO con lo verificado", YELLOW),
 ("5 · Validador de calidad","VETO si falla algo", YELLOW),
 ("6 · Editor legal","disclaimers · nada de afirmar sin fuente", GRAY),
 ("7 · Publicación","al sitio (GitHub Pages → VPS)", GREEN),
 ("8 · Personalizador","adapta al perfil, sin tocar los hechos", GREEN),
 ("9 · Examinador → BADGES","test, corrige y da la insignia", GREEN),
 ("10 · Feedback + Refresh","marcar / corregir / re-verificar obsoleto", YELLOW),
]
W, H = 330, 66
x0, y0, dx, dy = 120, 130, 34, 104
ids = []
for n,(title, sub, bg) in enumerate(rungs):
    x = x0 + n*dx; y = y0 + n*dy
    ids.append((boxed(x, y, W, H, title+"\n"+sub, bg), x, y))
# flechas verticales entre peldaños
for n in range(len(ids)-1):
    a,ax,ay = ids[n]; b,bx,by = ids[n+1]
    arrow(a, b, ax+W//2, ay+H, bx+W//2, by)

# puerta humana (entre 6 y 7)
_,px,py = ids[6]
hg = boxed(px+W+70, py-46, 300, 60, "PUERTA HUMANA · Marc revisa\nnada sale a alumnos sin su OK", PURPLE, size=14)
arrow(hg, ids[6][0], px+W+70, py-16, px+W, py+H//2)

# doctrina anti-invención (panel lateral)
dx2 = x0 + 3*dx + W + 90
rect(dx2, 130, 360, 470, RED, stroke='#c92a2a')
text(dx2+16, 150, 328, 30, "DOCTRINA ANTI-INVENCIÓN", size=18, align='left', color='#c92a2a')
doc = ("Lo que nos protege de una denuncia:\n\n"
 "• Grounding: solo se afirma lo verificado.\n"
 "• Fuente + fecha en cada dato.\n"
 "• Enlaces: solo si responden 200.\n"
 "• Cada frase: HECHO / INFERENCIA / SIN DATOS.\n"
 "• Verifica un agente distinto al que investiga.\n"
 "• Validador con poder de VETO.\n"
 "• Disclaimers en precios y normativa.\n"
 "• Puerta humana: Marc aprueba.\n"
 "• Refresh: lo obsoleto se re-verifica.\n\n"
 "= tu doctrina de siempre (boo-data-certainty,\n"
 "certeza HECHO/INFERENCIA/SIN DATOS), hecha\n"
 "obligatoria y automática en cada curso.")
text(dx2+16, 190, 328, 380, doc, size=13.5, align='left')

# reusa tus agentes (nota)
rect(dx2, 620, 360, 120, BLUE, stroke='#1971c2')
text(dx2+16, 636, 328, 24, "Reusa agentes que ya tienes:", size=15, align='left', color='#1971c2')
text(dx2+16, 662, 328, 70, "industry-research-expert · blog-seo-fact-checker\nquality-gate-supreme · boo-post-grader\nboo-data-certainty (skill)", size=13, align='left')

out = {"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":els,
  "appState":{"gridSize":None,"viewBackgroundColor":"#ffffff"},"files":{}}
pathlib.Path(r"C:\Users\march\formacion-coach-ide\pipeline.excalidraw").write_text(json.dumps(out), encoding="utf-8")
print("OK pipeline.excalidraw", len(els), "elementos")
