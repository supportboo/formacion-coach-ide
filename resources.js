/* Brandooers · recursos: promoción de autores + preparado para afiliación.
   - Marca todos los enlaces de recurso con data-res (id estable) si no lo tienen.
   - Registra los clics en boo_resclicks (localStorage) + beacon opcional (window.BOO_TRACK_URL).
   - Si window.BOO_REDIRECT_BASE está definido (VPS), hace pasar el enlace por /r/<id>?u=<url>,
     que en el servidor añade UTM + (futuro) tag de afiliado y loguea el clic.
   Sin VPS: los enlaces van directos al autor y solo registramos el clic localmente. */
(function(){
  "use strict";
  var USER=null; try{ USER=JSON.parse(localStorage.getItem('coach_user')||'null'); }catch(e){}
  var COURSE=document.title||location.pathname;
  function hash(s){ var h=0,i; for(i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return 'r'+(h>>>0).toString(36); }
  // selector de "recursos": enlaces salientes de valor (charlas, libros, perfiles, podcasts, blogs, fuentes)
  var SEL='a.rsrc, a.bthumb, a[data-res], .rsrc-list a, #recursos a[href^="http"], a.card[href^="https://www.amazon."]';

  function tag(a){
    if(a.__res) return; a.__res=1;
    var href=a.getAttribute('href')||'';
    if(!/^https?:/.test(href) && !a.hasAttribute('data-res')) return;   // solo enlaces externos
    var id=a.getAttribute('data-res'); if(!id){ id=hash(href||a.textContent); a.setAttribute('data-res',id); }
    // preparado para el redirector del VPS (afiliación/UTM), sin romper el estático
    if(window.BOO_REDIRECT_BASE && /^https?:/.test(href)){
      a.setAttribute('data-url', href);
      a.setAttribute('href', window.BOO_REDIRECT_BASE.replace(/\/$/,'')+'/r/'+id+'?u='+encodeURIComponent(href));
    }
  }
  function scan(){ document.querySelectorAll(SEL).forEach(tag); }

  function log(a){
    var rec={res:a.getAttribute('data-res'), url:a.getAttribute('data-url')||a.getAttribute('href'),
      label:(a.textContent||'').trim().slice(0,80), course:COURSE, email:USER?USER.email:null, ts:new Date().toISOString()};
    try{ var arr=JSON.parse(localStorage.getItem('boo_resclicks')||'[]'); arr.push(rec); localStorage.setItem('boo_resclicks', JSON.stringify(arr.slice(-2000))); }catch(e){}
    if(window.BOO_TRACK_URL){ try{ navigator.sendBeacon(window.BOO_TRACK_URL, new Blob([JSON.stringify(rec)],{type:'text/plain'})); }catch(e){} }
  }
  document.addEventListener('click', function(e){ var a=e.target.closest('a[data-res]'); if(a) log(a); }, true);

  scan();
  // re-escanear si el contenido cambia (p.ej. personalización reescribe secciones)
  try{ new MutationObserver(function(){ scan(); }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
})();
