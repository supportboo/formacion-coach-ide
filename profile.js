/* Brandooers · personalización por perfil de usuario
   Lee/edita brand_prefs (localStorage) y adapta el contenido:
   - reemplaza tokens {{icp}}, {{audience}}, {{ticket}}, {{sector}} en el texto
   - muestra/oculta bloques con data-when="audience:partners" (o ticket:alto, etc.)
   Un mismo método, muchas pieles: el curso resuena con cada tipo de usuario. */
(function(){
  "use strict";
  var AUD = {
    directa: {short:'Venta directa', icp:'clientes finales', market:'B2C / cliente final'},
    empresas:{short:'Venta B2B',      icp:'empresas',         market:'B2B'},
    partners:{short:'Captación de partners', icp:'partners y canal', market:'B2B · canal indirecto'}
  };
  var TICKET = { bajo:'ticket bajo / volumen', medio:'ticket medio', alto:'high ticket / venta consultiva' };

  function prefs(){ try{ return JSON.parse(localStorage.getItem('brand_prefs')||'{}'); }catch(e){ return {}; } }
  function setPrefs(p){ try{ localStorage.setItem('brand_prefs', JSON.stringify(p)); }catch(e){} }
  function tokens(){
    var p = prefs(); var a = AUD[p.audience] || null;
    return {
      icp: a ? a.icp : 'tu cliente ideal',
      audience: a ? a.market : 'tu mercado',
      ticket: TICKET[p.ticket] || 'tu ticket',
      sector: p.sector || 'tu sector'
    };
  }

  // ---- estilos ----
  var s = document.createElement('style');
  s.textContent = [
    '.pf-chip{position:fixed;top:12px;right:16px;z-index:1550;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:7px 14px;font:600 12.5px Inter,sans-serif;color:#714B67;box-shadow:0 3px 14px rgba(113,75,103,.12);cursor:pointer}',
    '.pf-chip .pf-dot{width:8px;height:8px;border-radius:50%;background:#875A7B}',
    '.pf-chip b{color:#2D2D2D}',
    '.pf-ov{position:fixed;inset:0;z-index:1900;background:rgba(45,45,45,.55);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px}',
    '.pf-ov.open{display:flex}',
    '.pf-box{background:#fff;border-radius:18px;max-width:460px;width:100%;padding:28px 26px;box-shadow:0 24px 70px rgba(0,0,0,.25)}',
    '.pf-box h3{font:800 20px Inter,sans-serif;color:#2D2D2D;margin:0 0 4px}',
    '.pf-box p.sub{font:400 13px Inter,sans-serif;color:#8F8F8F;margin:0 0 16px}',
    '.pf-q{font:600 13px Inter,sans-serif;color:#714B67;margin:14px 0 7px}',
    '.pf-opts{display:flex;flex-wrap:wrap;gap:7px}',
    '.pf-opts button{font:600 13px Inter,sans-serif;color:#4A4A4A;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:8px 14px;cursor:pointer}',
    '.pf-opts button.on{background:#714B67;border-color:#714B67;color:#fff}',
    '.pf-box input{width:100%;padding:11px 13px;border:1px solid #E8E0E5;border-radius:10px;font:400 14px Inter,sans-serif;margin-top:8px;outline:none}',
    '.pf-save{width:100%;margin-top:18px;background:#714B67;color:#fff;border:0;border-radius:10px;padding:12px;font:600 14px Inter,sans-serif;cursor:pointer}',
    '.pf-adapt{display:inline-block;font:700 11px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#875A7B;background:rgba(135,90,123,.1);border-radius:100px;padding:3px 10px}',
    '[data-when]{transition:opacity .2s}'
  ].join('');
  document.head.appendChild(s);

  // ---- chip ----
  var chip = document.createElement('button'); chip.className = 'pf-chip';
  document.body.appendChild(chip);
  function chipLabel(){
    var p = prefs(); var a = AUD[p.audience];
    chip.innerHTML = '<span class="pf-dot"></span>' + (a ? ('Perfil: <b>&nbsp;'+a.short+'</b>') : 'Personalizar formación') + ' <span style="opacity:.6">▸</span>';
  }

  // ---- popup ----
  var ov = document.createElement('div'); ov.className = 'pf-ov';
  ov.innerHTML = '<div class="pf-box"><h3>Adapta la formación a ti</h3><p class="sub">Elige tu caso y los ejemplos, mensajes y plantillas se ajustan. Un mismo método, tu contexto.</p>'
    + '<div class="pf-q">¿A quién le vendes?</div><div class="pf-opts" data-k="audience">'
    + '<button data-v="directa">Cliente final (B2C)</button><button data-v="empresas">Empresas (B2B)</button><button data-v="partners">Partners / canal</button></div>'
    + '<div class="pf-q">¿Qué ticket?</div><div class="pf-opts" data-k="ticket">'
    + '<button data-v="bajo">Bajo / volumen</button><button data-v="medio">Medio</button><button data-v="alto">Alto / consultivo</button></div>'
    + '<div class="pf-q">Tu sector (opcional)</div><input id="pfSector" placeholder="Ej.: software, servicios, ecommerce, industria…">'
    + '<button class="pf-save">Guardar y adaptar</button></div>';
  document.body.appendChild(ov);

  function paintOpts(){
    var p = prefs();
    ov.querySelectorAll('.pf-opts').forEach(function(g){
      var k = g.getAttribute('data-k');
      g.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', p[k]===b.getAttribute('data-v')); });
    });
    ov.querySelector('#pfSector').value = p.sector || '';
  }
  ov.querySelectorAll('.pf-opts button').forEach(function(b){
    b.onclick = function(){ var p = prefs(); p[b.parentNode.getAttribute('data-k')] = b.getAttribute('data-v'); setPrefs(p); paintOpts(); };
  });
  ov.querySelector('.pf-save').onclick = function(){ var p = prefs(); p.sector = ov.querySelector('#pfSector').value.trim(); setPrefs(p); ov.classList.remove('open'); apply(); chipLabel(); };
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });
  chip.onclick = function(){ paintOpts(); ov.classList.add('open'); };

  // ---- aplicar personalización ----
  function apply(){
    var t = tokens();
    // 1) tokens en texto
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null); var n;
    while((n = w.nextNode())){
      if(n.parentElement && n.parentElement.closest('.pf-ov,.pf-chip,script,style')) continue;
      if(n.nodeValue.indexOf('{{')<0) continue;
      n.nodeValue = n.nodeValue.replace(/\{\{(icp|audience|ticket|sector)\}\}/g, function(_,k){ return t[k]; });
    }
    // 2) bloques condicionales data-when="audience:partners|directa" o "ticket:alto"
    var p = prefs();
    document.querySelectorAll('[data-when]').forEach(function(el){
      var cond = el.getAttribute('data-when'); var parts = cond.split(':'); var key = parts[0]; var vals = (parts[1]||'').split('|');
      var show = !p[key] ? el.hasAttribute('data-when-default') : vals.indexOf(p[key])>=0;
      el.style.display = show ? '' : 'none';
    });
  }

  chipLabel();
  if(document.readyState!=='loading') apply(); else document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
