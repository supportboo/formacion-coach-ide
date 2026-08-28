/* Brandooers · personalización por perfil de usuario (MOTOR de adaptación).
   Adapta el contenido al caso del alumno recogido en el ONBOARDING (localStorage brand_prefs):
   - PRESETS (caso): Odoo B2B / Ecommerce / Servicios high-ticket → reescribe título,
     descripción, ganchos y práctica de las secciones con data-pf-slot (window.BOO_PERSONALIZATION).
   - Tokens {{icp}} {{audience}} {{ticket}} {{sector}} y bloques data-when="audience:...".
   NOTA: el chip flotante "Personalizar formación" se retiró; la personalización la conduce el
   onboarding (no un botón aparte). En el VPS lo generará una API en vivo para cualquier sector. */
(function(){
  "use strict";
  var PRESETS = {
    odoo:      {label:'Implantador de Odoo (B2B)', short:'Odoo · B2B',   audience:'empresas', icp:'pymes (B2B)',           market:'B2B'},
    ecommerce: {label:'Ecommerce / DTC (B2C)',     short:'Ecommerce',    audience:'directa',  icp:'negocios ecommerce',    market:'ecommerce · B2C/DTC'},
    servicios: {label:'Servicios high-ticket',     short:'Servicios',    audience:'empresas', icp:'clientes de servicios', market:'B2B · high-ticket'}
  };
  var TICKET = { bajo:'ticket bajo / volumen', medio:'ticket medio', alto:'high ticket / venta consultiva' };

  function prefs(){ try{ return JSON.parse(localStorage.getItem('brand_prefs')||'{}'); }catch(e){ return {}; } }
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
    '.pf-adapt{display:inline-block;font:700 11px Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#8B5CF6;background:rgba(139,92,246,.1);border-radius:100px;padding:3px 10px}',
    '[data-when]{transition:opacity .2s}'
  ].join('');
  document.head.appendChild(s);

  // ---- reescribir slots de contenido con lo generado por el agente ----
  function renderHooks(label, hooks){
    return '<div class="grid-2">' + hooks.map(function(h){
      return '<div class="note-card"><span class="pf-adapt">'+esc(label)+'</span><div class="note-title" style="margin-top:6px">'+esc(h.title)+'</div><p style="font-size:13.5px">«'+esc(h.msg)+'»</p></div>';
    }).join('') + '</div>';
  }
  function slotEls(){ return [].slice.call(document.querySelectorAll('[data-pf-slot]')); }
  function groupsOnPage(){ var g={}; slotEls().forEach(function(el){var n=el.getAttribute('data-pf-slot');g[n.slice(0,n.lastIndexOf('-'))]=1;}); return Object.keys(g); }
  function injectField(el, field, v, label){
    if(el._pfCanon==null) el._pfCanon = el.innerHTML;
    if(!v){ el.innerHTML = el._pfCanon; return; }
    if(field==='title' && v.title!=null) el.textContent = v.title;
    else if(field==='desc' && v.desc!=null) el.textContent = v.desc;
    else if(field==='hooks' && v.hooks) el.innerHTML = renderHooks(label, v.hooks);
    else if(field==='practica' && v.practica!=null) el.innerHTML = '<div class="callout callout-warm" style="margin-top:16px"><h4><span class="pf-adapt">Adaptado a ti</span>&nbsp; La práctica de hoy</h4><p>'+esc(v.practica)+'</p></div>';
    else el.innerHTML = el._pfCanon;
  }
  function fillGroup(group, content, label){
    slotEls().forEach(function(el){ var n=el.getAttribute('data-pf-slot'); var i=n.lastIndexOf('-'); if(n.slice(0,i)!==group) return; injectField(el, n.slice(i+1), content, label); });
  }
  function fillSlots(preset){   // pre-generado (estático)
    var DATA = window.BOO_PERSONALIZATION || {};
    slotEls().forEach(function(el){ var n=el.getAttribute('data-pf-slot'); var i=n.lastIndexOf('-'); var group=n.slice(0,i);
      injectField(el, n.slice(i+1), preset && DATA[group] && DATA[group][preset], PRESETS[preset]?PRESETS[preset].short:'Tu caso'); });
  }
  function hash(s){ var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return h; }
  function livePersonalize(profileText){   // en vivo (agente en el servidor IONOS)
    var DATA = window.BOO_PERSONALIZATION || {}; var base = (window.BOO_API_BASE||'').replace(/\/$/,'');
    groupsOnPage().forEach(function(group){
      var canon = DATA[group] && (DATA[group].odoo || DATA[group][Object.keys(DATA[group])[0]]); if(!canon) return;
      var ck = 'pf_live_'+group+'_'+hash(profileText);
      var cached; try{ cached = sessionStorage.getItem(ck); }catch(e){}
      if(cached){ fillGroup(group, JSON.parse(cached), 'Tu caso'); return; }
      fetch(base+'/api/personalize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile:profileText, section:canon})})
        .then(function(r){ return r.json(); }).then(function(v){ if(v && !v.error){ try{ sessionStorage.setItem(ck, JSON.stringify(v)); }catch(e){} fillGroup(group, v, 'Tu caso'); } }).catch(function(){});
    });
  }

  function apply(){
    var t = tokens();
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null); var n;
    while((n = w.nextNode())){
      if(n.parentElement && n.parentElement.closest('script,style,[data-pf-slot]')) continue;
      if(n.nodeValue.indexOf('{{')<0) continue;
      n.nodeValue = n.nodeValue.replace(/\{\{(icp|audience|ticket|sector)\}\}/g, function(_,k){ return t[k]; });
    }
    var p = prefs();
    document.querySelectorAll('[data-when]').forEach(function(el){
      var parts = el.getAttribute('data-when').split(':'); var key = parts[0]; var vals = (parts[1]||'').split('|');
      var show = !p[key] ? el.hasAttribute('data-when-default') : vals.indexOf(p[key])>=0;
      el.style.display = show ? '' : 'none';
    });
    if(window.BOO_API_BASE && p.profileText){ livePersonalize(p.profileText); } else { fillSlots(p.preset); }
  }

  if(document.readyState!=='loading') apply(); else document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
