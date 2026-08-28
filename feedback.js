/* Brandooers · sistema de feedback y revisión de contenido
   Subraya/selecciona texto → marca Útil / Mejorar / Obsoleto + comentario.
   Guarda en localStorage (boo_feedback) y, si hay window.BOO_FEEDBACK_URL, lo envía por beacon.
   Panel "Mis notas" para revisar todo lo marcado. Autoría vía coach_user. */
(function(){
  "use strict";
  var COURSE = (document.currentScript && document.currentScript.getAttribute('data-course')) || document.title || location.pathname;
  var KEY = 'boo_feedback';
  var USER = null; try{ USER = JSON.parse(localStorage.getItem('coach_user')||'null'); }catch(e){}
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function save(a){ try{ localStorage.setItem(KEY, JSON.stringify(a.slice(-2000))); }catch(e){} }
  function forCourse(){ return load().filter(function(f){ return f.course===COURSE; }); }
  function nowISO(){ return new Date().toISOString(); }
  function esc(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var TYPES = {
    good:{lb:'Útil', ic:'👍', col:'#21B799'},
    improve:{lb:'Mejorar', ic:'👎', col:'#E46E78'},
    stale:{lb:'Obsoleto', ic:'⚠️', col:'#E4A900'},
    note:{lb:'Comentario', ic:'✎', col:'#8B5CF6'}
  };

  // ---- estilos ----
  var css = document.createElement('style');
  css.textContent = [
    '.fb-toggle{position:fixed;right:22px;bottom:22px;z-index:1600;display:flex;align-items:center;gap:8px;background:#8B5CF6;color:#fff;border:none;border-radius:100px;padding:11px 18px;font:600 13px Inter,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(139,92,246,.35)}',
    '.fb-toggle.on{background:#0891B2}',
    '.fb-toggle .fb-badge{background:#fff;color:#8B5CF6;border-radius:100px;font-size:11px;font-weight:800;padding:1px 7px}',
    'body.fb-mode{cursor:crosshair}',
    'body.fb-mode, body.fb-mode *{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important}',
    '@media(max-width:820px),(pointer:coarse){.fb-toggle,.fb-panel,.fb-bar{display:none!important}}',
    'body.fb-mode section, body.fb-mode .module, body.fb-mode .frontsec{position:relative}',
    '.fb-bar{position:absolute;z-index:1650;display:flex;gap:2px;background:#2D2D2D;border-radius:10px;padding:4px;box-shadow:0 8px 26px rgba(0,0,0,.28);transform:translate(-50%,-100%)}',
    '.fb-bar button{background:none;border:0;color:#fff;font:600 12px Inter,sans-serif;padding:6px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}',
    '.fb-bar button:hover{background:rgba(255,255,255,.15)}',
    '.fb-mark{border-radius:2px;padding:0 1px;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone}',
    '.fb-mark.good{background:rgba(33,183,153,.22);border-bottom:2px solid #21B799}',
    '.fb-mark.improve{background:rgba(228,110,120,.20);border-bottom:2px solid #E46E78}',
    '.fb-mark.stale{background:rgba(228,169,0,.24);border-bottom:2px solid #E4A900}',
    '.fb-mark.note{background:rgba(139,92,246,.16);border-bottom:2px solid #8B5CF6}',
    '.fb-panel{position:fixed;right:0;top:0;bottom:0;width:min(400px,92vw);background:#fff;z-index:1700;box-shadow:-8px 0 30px rgba(0,0,0,.16);transform:translateX(100%);transition:transform .25s;display:flex;flex-direction:column}',
    '.fb-panel.open{transform:none}',
    '.fb-panel header{padding:18px 20px;border-bottom:1px solid #F0EAEE;display:flex;justify-content:space-between;align-items:center}',
    '.fb-panel header h3{font:800 17px Inter,sans-serif;color:#2D2D2D;margin:0}',
    '.fb-panel .fb-x{background:none;border:0;font-size:24px;color:#8F8F8F;cursor:pointer}',
    '.fb-list{flex:1;overflow-y:auto;padding:12px 16px}',
    '.fb-item{border:1px solid #F0EAEE;border-left:3px solid;border-radius:10px;padding:12px 14px;margin-bottom:10px}',
    '.fb-item .fb-q{font-size:13px;color:#4A4A4A;font-style:italic;cursor:pointer}',
    '.fb-item .fb-meta{font-size:11px;color:#8F8F8F;margin-top:6px;display:flex;justify-content:space-between;align-items:center}',
    '.fb-item .fb-cm{font-size:13px;color:#2D2D2D;margin-top:6px}',
    '.fb-item .fb-del{background:none;border:0;color:#E46E78;font-size:11px;font-weight:700;cursor:pointer}',
    '.fb-foot{padding:12px 16px;border-top:1px solid #F0EAEE;display:flex;gap:8px}',
    '.fb-foot button{flex:1;background:#F5F0EE;border:1px solid #E8E0E5;border-radius:9px;padding:9px;font:600 12px Inter,sans-serif;color:#8B5CF6;cursor:pointer}',
    '.fb-empty{color:#8F8F8F;font-size:13px;text-align:center;padding:30px 10px}'
  ].join('');
  document.head.appendChild(css);

  // ---- botón + panel ----
  var toggle = document.createElement('button');
  toggle.className = 'fb-toggle';
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg> <span class="fb-txt">Sugerir mejora</span> <span class="fb-badge">0</span>';
  toggle.title = 'Selecciona texto del curso y márcalo Útil / Mejorar / Obsoleto para ayudarnos a mejorarlo';
  document.body.appendChild(toggle);
  var badge = toggle.querySelector('.fb-badge');

  var panel = document.createElement('aside');
  panel.className = 'fb-panel';
  panel.innerHTML = '<header><h3>Mis notas de revisión</h3><button class="fb-x" aria-label="Cerrar">×</button></header><div class="fb-list"></div><div class="fb-foot"><button class="fb-copy">Copiar todo (JSON)</button><button class="fb-clear">Vaciar</button></div>';
  document.body.appendChild(panel);
  var listEl = panel.querySelector('.fb-list');

  var bar = null;
  function killBar(){ if(bar){ bar.remove(); bar = null; } }

  function updateBadge(){ badge.textContent = forCourse().length; }

  function record(type, quote, comment, range){
    var all = load();
    var item = { id:'f'+Date.now()+Math.round(Math.random()*1e4), course:COURSE, section:sectionOf(range), type:type, quote:quote.slice(0,600), comment:comment||'', user:USER?USER.email:null, name:USER?USER.name:null, ts:nowISO() };
    all.push(item); save(all); updateBadge(); renderList();
    if(window.BOO_FEEDBACK_URL){ try{ navigator.sendBeacon(window.BOO_FEEDBACK_URL, new Blob([JSON.stringify(item)],{type:'text/plain'})); }catch(e){} }
    try{ if(range) highlightRange(range, type, item.id); }catch(e){}
    return item;
  }
  function sectionOf(range){
    var n = range && range.startContainer; while(n && n.nodeType!==1){ n = n.parentNode; }
    while(n && !n.id){ n = n.closest ? (n.parentElement && n.parentElement.closest('[id]')) : null; if(n && n.id) break; }
    return n && n.id ? n.id : '';
  }
  function highlightRange(range, type, id){
    var m = document.createElement('mark'); m.className = 'fb-mark '+type; m.setAttribute('data-fb', id);
    try{ range.surroundContents(m); }catch(e){ /* selección cruza nodos: se omite el subrayado */ }
  }

  // selección → barra de acciones
  document.addEventListener('mouseup', function(e){
    if(!document.body.classList.contains('fb-mode')) return;
    if(bar && e && bar.contains(e.target)) return; // clic dentro de la barra: no reconstruir
    var sel = window.getSelection(); if(!sel || sel.isCollapsed) { killBar(); return; }
    var text = sel.toString().trim(); if(text.length < 3){ killBar(); return; }
    var range = sel.getRangeAt(0); var rect = range.getBoundingClientRect();
    var savedRange = range.cloneRange(); var savedText = text; // capturados ya, no dependen de la selección viva
    killBar();
    bar = document.createElement('div'); bar.className = 'fb-bar';
    Object.keys(TYPES).forEach(function(k){
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = TYPES[k].ic+' '+TYPES[k].lb;
      b.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation();
        var cm = ''; if(k==='note' || k==='improve' || k==='stale'){ cm = window.prompt('Comentario ('+TYPES[k].lb+') — opcional:','')||''; }
        record(k, savedText, cm, savedRange.cloneRange()); try{ window.getSelection().removeAllRanges(); }catch(e){} killBar();
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    bar.style.left = (rect.left + rect.width/2 + window.scrollX) + 'px';
    bar.style.top = (rect.top + window.scrollY - 6) + 'px';
  });
  document.addEventListener('mousedown', function(e){ if(bar && !bar.contains(e.target)) killBar(); });

  function renderList(){
    var items = forCourse().slice().reverse();
    if(!items.length){ listEl.innerHTML = '<div class="fb-empty">Aún no has marcado nada.<br>Activa «Revisar», selecciona texto y elige Útil / Mejorar / Obsoleto.</div>'; return; }
    listEl.innerHTML = items.map(function(f){
      var t = TYPES[f.type]||TYPES.note;
      return '<div class="fb-item" style="border-left-color:'+t.col+'" data-id="'+f.id+'" data-sec="'+esc(f.section)+'" data-q="'+esc(f.quote)+'">'
        + '<div class="fb-q">“'+esc(f.quote.slice(0,180))+(f.quote.length>180?'…':'')+'”</div>'
        + (f.comment?'<div class="fb-cm">'+esc(f.comment)+'</div>':'')
        + '<div class="fb-meta"><span style="color:'+t.col+';font-weight:700">'+t.ic+' '+t.lb+'</span><button class="fb-del">Borrar</button></div></div>';
    }).join('');
  }
  listEl.addEventListener('click', function(e){
    var item = e.target.closest('.fb-item'); if(!item) return;
    if(e.target.classList.contains('fb-del')){
      var id = item.getAttribute('data-id'); save(load().filter(function(x){return x.id!==id;}));
      var mk = document.querySelector('mark[data-fb="'+id+'"]'); if(mk){ mk.replaceWith(document.createTextNode(mk.textContent)); }
      updateBadge(); renderList(); return;
    }
    // clic en la cita → ir a la sección
    var sec = item.getAttribute('data-sec'); var el = sec && document.getElementById(sec);
    if(el){ el.scrollIntoView({behavior:'smooth'}); }
  });

  // re-subrayar lo marcado (best-effort) al cargar
  function reHighlight(){
    forCourse().forEach(function(f){
      if(!f.quote || f.quote.length>200) return;
      var host = (f.section && document.getElementById(f.section)) || document.body;
      var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
      var node; while((node = w.nextNode())){
        var i = node.nodeValue.indexOf(f.quote);
        if(i>=0 && !node.parentElement.closest('.fb-mark')){
          try{ var r = document.createRange(); r.setStart(node,i); r.setEnd(node,i+f.quote.length); highlightRange(r, f.type, f.id); }catch(e){}
          break;
        }
      }
    });
  }

  var fbTxt = toggle.querySelector('.fb-txt');
  toggle.addEventListener('click', function(){
    var on = document.body.classList.toggle('fb-mode');
    toggle.classList.toggle('on', on);
    fbTxt.textContent = on ? 'Salir de revisión' : 'Sugerir mejora';
    if(on){ panel.classList.add('open'); } else { panel.classList.remove('open'); killBar(); }
  });
  panel.querySelector('.fb-x').addEventListener('click', function(){ panel.classList.remove('open'); document.body.classList.remove('fb-mode'); toggle.classList.remove('on'); fbTxt.textContent='Sugerir mejora'; killBar(); });
  panel.querySelector('.fb-copy').addEventListener('click', function(){
    var data = JSON.stringify(forCourse(), null, 2);
    (navigator.clipboard ? navigator.clipboard.writeText(data) : Promise.reject()).then(function(){ alert('Notas copiadas al portapapeles ('+forCourse().length+').'); }, function(){ window.prompt('Copia tus notas:', data); });
  });
  panel.querySelector('.fb-clear').addEventListener('click', function(){
    if(!confirm('¿Vaciar todas tus notas de esta formación?')) return;
    save(load().filter(function(x){return x.course!==COURSE;}));
    document.querySelectorAll('mark.fb-mark').forEach(function(m){ m.replaceWith(document.createTextNode(m.textContent)); });
    updateBadge(); renderList();
  });

  updateBadge(); renderList();
  if(document.readyState==='complete') reHighlight(); else window.addEventListener('load', reHighlight);
})();
