/* Brandooers · personalización por perfil de usuario
   Lee/edita brand_prefs (localStorage) y adapta el contenido:
   - PRESETS (caso): Odoo B2B / Ecommerce / Servicios high-ticket → reescribe título,
     descripción, ganchos y práctica de las secciones con data-pf-slot, usando el
     contenido generado por el agente (window.BOO_PERSONALIZATION).
   - Tokens {{icp}} {{audience}} {{ticket}} {{sector}} y bloques data-when="audience:...".
   Prueba de concepto build-time. En el VPS lo generará una API en vivo para cualquier sector. */
(function(){
  "use strict";
  var PRESETS = {
    odoo:      {label:'Implantador de Odoo (B2B)', short:'Odoo · B2B',   audience:'empresas', icp:'pymes (B2B)',           market:'B2B'},
    ecommerce: {label:'Ecommerce / DTC (B2C)',     short:'Ecommerce',    audience:'directa',  icp:'negocios ecommerce',    market:'ecommerce · B2C/DTC'},
    servicios: {label:'Servicios high-ticket',     short:'Servicios',    audience:'empresas', icp:'clientes de servicios', market:'B2B · high-ticket'}
  };
  var TICKET = { bajo:'ticket bajo / volumen', medio:'ticket medio', alto:'high ticket / venta consultiva' };

  function prefs(){ try{ return JSON.parse(localStorage.getItem('brand_prefs')||'{}'); }catch(e){ return {}; } }
  function setPrefs(p){ try{ localStorage.setItem('brand_prefs', JSON.stringify(p)); }catch(e){} }
  function esc(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function tokens(){
    var p = prefs(); var pr = PRESETS[p.preset];
    return {
      icp: pr ? pr.icp : 'tu cliente ideal',
      audience: pr ? pr.market : 'tu mercado',
      ticket: TICKET[p.ticket] || (pr ? '' : 'tu ticket'),
      sector: p.sector || (pr ? pr.short : 'tu sector')
    };
  }

  var s = document.createElement('style');
  s.textContent = [
    '.pf-chip{position:fixed;top:12px;right:16px;z-index:1550;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:7px 14px;font:600 12.5px Inter,sans-serif;color:#714B67;box-shadow:0 3px 14px rgba(113,75,103,.12);cursor:pointer}',
    '.pf-chip .pf-dot{width:8px;height:8px;border-radius:50%;background:#875A7B}',
    '.pf-chip b{color:#2D2D2D}',
    '.pf-ov{position:fixed;inset:0;z-index:1900;background:rgba(45,45,45,.55);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px}',
    '.pf-ov.open{display:flex}',
    '.pf-box{background:#fff;border-radius:18px;max-width:470px;width:100%;padding:28px 26px;box-shadow:0 24px 70px rgba(0,0,0,.25);max-height:88vh;overflow-y:auto}',
    '.pf-box h3{font:800 20px Inter,sans-serif;color:#2D2D2D;margin:0 0 4px}',
    '.pf-box p.sub{font:400 13px Inter,sans-serif;color:#8F8F8F;margin:0 0 16px}',
    '.pf-q{font:600 13px Inter,sans-serif;color:#714B67;margin:16px 0 7px}',
    '.pf-opts{display:flex;flex-wrap:wrap;gap:7px}',
    '.pf-opts button{font:600 13px Inter,sans-serif;color:#4A4A4A;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:8px 14px;cursor:pointer}',
    '.pf-opts button.on{background:#714B67;border-color:#714B67;color:#fff}',
    '.pf-box input{width:100%;padding:11px 13px;border:1px solid #E8E0E5;border-radius:10px;font:400 14px Inter,sans-serif;margin-top:8px;outline:none}',
    '.pf-save{width:100%;margin-top:20px;background:#714B67;color:#fff;border:0;border-radius:10px;padding:12px;font:600 14px Inter,sans-serif;cursor:pointer}',
    '.pf-adapt{display:inline-block;font:700 11px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#875A7B;background:rgba(135,90,123,.1);border-radius:100px;padding:3px 10px}',
    '[data-when]{transition:opacity .2s}'
  ].join('');
  document.head.appendChild(s);

  var chip = document.createElement('button'); chip.className = 'pf-chip'; document.body.appendChild(chip);
  function chipLabel(){
    var pr = PRESETS[prefs().preset];
    chip.innerHTML = '<span class="pf-dot"></span>' + (pr ? ('Caso: <b>&nbsp;'+pr.short+'</b>') : 'Personalizar formación') + ' <span style="opacity:.6">▸</span>';
  }

  var ov = document.createElement('div'); ov.className = 'pf-ov';
  ov.innerHTML = '<div class="pf-box"><h3>Adapta la formación a tu caso</h3><p class="sub">Elige tu caso y la formación reescribe titulares, ejemplos y prácticas para que suenen a tu mundo. Mismo método, tu contexto.</p>'
    + '<div class="pf-q">¿Cuál es tu caso?</div><div class="pf-opts" data-k="preset">'
    + '<button data-v="odoo">Implantador Odoo (B2B)</button><button data-v="ecommerce">Ecommerce / DTC (B2C)</button><button data-v="servicios">Servicios high-ticket</button></div>'
    + '<div class="pf-q">¿Qué ticket?</div><div class="pf-opts" data-k="ticket">'
    + '<button data-v="bajo">Bajo / volumen</button><button data-v="medio">Medio</button><button data-v="alto">Alto / consultivo</button></div>'
    + '<div class="pf-q">Tu sector concreto (opcional)</div><input id="pfSector" placeholder="Ej.: moda, industria, SaaS, hostelería…">'
    + '<button class="pf-save">Guardar y adaptar</button></div>';
  document.body.appendChild(ov);

  function paintOpts(){
    var p = prefs();
    ov.querySelectorAll('.pf-opts').forEach(function(g){ var k=g.getAttribute('data-k');
      g.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', p[k]===b.getAttribute('data-v')); }); });
    ov.querySelector('#pfSector').value = p.sector || '';
  }
  ov.querySelectorAll('.pf-opts button').forEach(function(b){
    b.onclick = function(){ var p = prefs(); p[b.parentNode.getAttribute('data-k')] = b.getAttribute('data-v');
      if(b.parentNode.getAttribute('data-k')==='preset'){ p.audience = (PRESETS[p.preset]||{}).audience; }
      setPrefs(p); paintOpts(); };
  });
  ov.querySelector('.pf-save').onclick = function(){ var p = prefs(); p.sector = ov.querySelector('#pfSector').value.trim(); setPrefs(p); ov.classList.remove('open'); apply(); chipLabel(); };
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });
  chip.onclick = function(){ paintOpts(); ov.classList.add('open'); };

  // ---- reescribir slots de contenido con lo generado por el agente ----
  function renderHooks(preset, hooks){
    return '<div class="grid-2">' + hooks.map(function(h){
      return '<div class="note-card"><span class="pf-adapt">'+esc(PRESETS[preset].short)+'</span><div class="note-title" style="margin-top:6px">'+esc(h.title)+'</div><p style="font-size:13.5px">«'+esc(h.msg)+'»</p></div>';
    }).join('') + '</div>';
  }
  function fillSlots(preset){
    var DATA = window.BOO_PERSONALIZATION || {};
    document.querySelectorAll('[data-pf-slot]').forEach(function(el){
      if(el._pfCanon==null) el._pfCanon = el.innerHTML;   // guardar canónico una vez
      var name = el.getAttribute('data-pf-slot'); var i = name.lastIndexOf('-');
      var group = name.slice(0,i), field = name.slice(i+1);
      var v = preset && DATA[group] && DATA[group][preset];
      if(!v){ el.innerHTML = el._pfCanon; return; }  // sin caso → contenido canónico
      if(field==='title' && v.title!=null) el.textContent = v.title;
      else if(field==='desc' && v.desc!=null) el.textContent = v.desc;
      else if(field==='hooks' && v.hooks) el.innerHTML = renderHooks(preset, v.hooks);
      else if(field==='practica' && v.practica!=null) el.innerHTML = '<div class="callout callout-warm" style="margin-top:16px"><h4><span class="pf-adapt">Adaptado a ti</span>&nbsp; La práctica de hoy</h4><p>'+esc(v.practica)+'</p></div>';
      else el.innerHTML = el._pfCanon;
    });
  }

  function apply(){
    var t = tokens();
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null); var n;
    while((n = w.nextNode())){
      if(n.parentElement && n.parentElement.closest('.pf-ov,.pf-chip,script,style,[data-pf-slot]')) continue;
      if(n.nodeValue.indexOf('{{')<0) continue;
      n.nodeValue = n.nodeValue.replace(/\{\{(icp|audience|ticket|sector)\}\}/g, function(_,k){ return t[k]; });
    }
    var p = prefs();
    document.querySelectorAll('[data-when]').forEach(function(el){
      var parts = el.getAttribute('data-when').split(':'); var key = parts[0]; var vals = (parts[1]||'').split('|');
      var show = !p[key] ? el.hasAttribute('data-when-default') : vals.indexOf(p[key])>=0;
      el.style.display = show ? '' : 'none';
    });
    fillSlots(p.preset);
  }

  chipLabel();
  if(document.readyState!=='loading') apply(); else document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
